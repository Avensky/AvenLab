import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { open } from 'node:fs/promises';

const frontend = new URL('../', import.meta.url);
const publicRoot = new URL('public/', frontend);
const catalogRoot = new URL('../../packages/wardrobe-catalog/', import.meta.url);
const wardrobe = JSON.parse(readFileSync(new URL('character-wardrobe.json', catalogRoot), 'utf8'));
const garments = JSON.parse(readFileSync(new URL('character-garments.json', catalogRoot), 'utf8'));
const models = 'models/characters/';
const corsets = `${models}female/wardrobe/corsets/`;
const tiers = ['garage', 'mobile'];
const variants = tiers.flatMap(tier => [
  ['Laced Bodice', `${corsets}gothic-laced-bodice.${tier}.glb`],
  ['Sweetheart bundle', `${models}wardrobe/gothic-02.${tier}.glb`],
  ['Ruffled bundle', `${models}wardrobe/gothic-03.${tier}.glb`],
  ['Underbust Over', `${corsets}gothic-underbust-vest.${tier}.glb`],
  ['Underbust Original Cut', `${corsets}gothic-underbust-vest-original-cut.${tier}.glb`],
  ['Underbust Tucked', `${corsets}gothic-underbust-vest-tucked.${tier}.glb`],
  ['High Collar', `${corsets}gothic-high-collar.${tier}.glb`],
].map(([name, path]) => ({ name, tier, path })));
const generatedVariants = tiers.flatMap(tier => [
  { name: 'Sweetheart standalone', tier, path: `${corsets}gothic-02.${tier}.glb` },
  { name: 'Ruffled standalone', tier, path: `${corsets}gothic-03.${tier}.glb` },
]);
const required = [...new Set([
  ...variants.map(({ path }) => path),
  ...wardrobe.flatMap(({ id }) => tiers.map(tier => `${models}wardrobe/${id}.${tier}.glb`)),
  ...['', '.garage', '.portrait'].map(suffix => `${models}villagers/villager-female/villager-female${suffix}.glb`),
  ...garments.filter(({ id }) => /^top-0[1-5]$/.test(id) || /^skirt-0[1-4]$/.test(id) || id.startsWith('gothic-skirt-') || id === 'bowtie-01')
    .flatMap(({ url, mobileUrl }) => [url, mobileUrl].filter(Boolean).map(path => path.slice(1))),
])].sort();

const fastSuites = [
  'tests/wardrobe-discovery.test.mjs', 'tests/wardrobe.test.mjs', 'tests/wardrobe-preview.test.mjs',
  'tests/dressing-room.test.mjs', 'tests/character-page.test.mjs', 'tests/wardrobe-over-skirt.test.mjs',
  'tests/saved-outfits.test.mjs',
];
const fullSuites = [
  ...fastSuites, 'tests/fitting-controls.test.mjs', 'tests/fitting-room-mirror.test.mjs',
  'tests/fitting-orbit-pointer.test.mjs', 'tests/character-portrait-cadence.test.mjs',
  'tests/menu-preview-lifecycle.test.mjs', 'tests/portrait-geometry.test.mjs',
];
const realAssetTests = [
  'the authored Sweetheart', 'standalone wardrobe exports', 'standalone corsets and a selected skirt',
  'turning off wardrobe layers fits underwear', 'Gothic Skirt 04 and Top 02 replace stock pieces',
  'the rebuilt Gothic Underbust', 'standalone briefs follow a V', 'wardrobe underwear reuses donor cuts', 'rebuilt Tucked hardware', 'rebuilt Laced Bodice',
  'the Village skirt and belt cover', 'Ruffled Corset', 'High Collar cup', 'Laced Bodice straps', 'Top 03 keeps', 'Top 04 keeps', 'the Village bonnet',
  'short skirts use', 'each Gothic skirt closes its waistband gap', 'the lowered Gothic skirts keep skin', 'neck bows follow the worn neckline',
];

function runFrontendNode(args, strictAssets = false) {
  const result = spawnSync(process.execPath, args, {
    cwd: frontend,
    env: strictAssets ? { ...process.env, AVENLAB_WARDROBE_REQUIRE_ASSETS: '1' } : process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status === 0;
}

function runTests(args, strictAssets = false) {
  return runFrontendNode(['--test', '--test-concurrency=2', ...args], strictAssets);
}

async function hasGlbHeader(path) {
  let file;
  try {
    file = await open(new URL(path, publicRoot));
    const header = Buffer.alloc(12);
    const { bytesRead } = await file.read(header);
    return bytesRead === header.length && header.toString('ascii', 0, 4) === 'glTF'
      && header.readUInt32LE(4) === 2 && header.readUInt32LE(8) === (await file.stat()).size;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  } finally {
    await file?.close();
  }
}

async function runFullAudit() {
  const results = await Promise.all(required.map(hasGlbHeader));
  const missing = required.filter((_, index) => !results[index]);
  if (missing.length) {
    console.error('Full wardrobe audit requires materialized GLB files. Missing, invalid or still LFS pointers:');
    for (const path of missing) console.error(`  frontend/public/${path}`);
    console.error('Generate the Git LFS include list with npm --prefix frontend run --silent audit:wardrobe -- --list-lfs.');
    return false;
  }
  console.log(`Wardrobe audit found all ${required.length} required GLB inputs.`);
  const characterLodsPass = runFrontendNode(['scripts/build-character-lods.mjs']);
  const piecesPass = runFrontendNode(['scripts/build-wardrobe-pieces.mjs']);
  if (!piecesPass) console.error('FAIL generated wardrobe pieces: scripts/build-wardrobe-pieces.mjs failed.');
  const { auditWardrobeAssets, auditCurrentCorsetMasks } = await import('./audit-wardrobe-assets.mjs');
  const assetsPass = await auditWardrobeAssets(publicRoot, [...variants, ...generatedVariants]);
  const testsPass = runTests([`--test-name-pattern=${realAssetTests.join('|')}`, 'tests/wardrobe-garment-assets.test.mjs'], true);
  const topFitPass = runTests(['tests/top03-armhole.test.mjs', 'tests/top05-fit.test.mjs'], true);
  const skirtFitsPass = runTests(['tests/tucked-skirt-pairings.test.mjs', 'tests/tucked-skirt-outfits.test.mjs',
    'tests/short-skirt-fabric.test.mjs', 'tests/wardrobe-hand-clearance.test.mjs', 'tests/gothic-skirt-layers.test.mjs',
    'tests/gothic-handkerchief-panels.test.mjs'], true);
  const masksPass = await auditCurrentCorsetMasks(frontend, publicRoot);
  return characterLodsPass && piecesPass && assetsPass && testsPass && topFitPass && skirtFitsPass && masksPass;
}

const [mode, ...extra] = process.argv.slice(2);
if (extra.length || (mode && mode !== '--full' && mode !== '--list-lfs')) {
  console.error('Usage: npm --prefix frontend run audit:wardrobe -- [--full | --list-lfs]');
  process.exitCode = 2;
} else if (mode === '--list-lfs') {
  console.log(required.map(path => `frontend/public/${path}`).join(','));
} else {
  const fixturesPass = runTests(mode === '--full' ? fullSuites : fastSuites);
  const assetsPass = mode === '--full' ? await runFullAudit() : true;
  if (!fixturesPass || !assetsPass) process.exitCode = 1;
}
