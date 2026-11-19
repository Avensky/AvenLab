import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  characterLod, findVillagerModel, hasCharacterModel, hasCompatibleWardrobeRevision,
  installedPackedVesperPortrait, vesperActorUrls,
} from './character-model-paths.mts';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const repository = resolve(frontend, '..'), publicRoot = resolve(frontend, 'public');
const catalogRoot = resolve(repository, 'packages/wardrobe-catalog');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const optional = path => readFile(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
const json = async path => JSON.parse((await readFile(path)).toString());
const publicFile = url => {
  const path = resolve(publicRoot, '.' + url.split(/[?#]/, 1)[0]);
  if (relative(publicRoot, path).startsWith('..')) throw Error('Asset escapes the public root: ' + url);
  return path;
};

function imageDimensions(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    for (let at = 12; at + 8 <= bytes.length;) {
      const type = bytes.toString('ascii', at, at + 4), length = bytes.readUInt32LE(at + 4), start = at + 8;
      if (start + length > bytes.length) break;
      if (type === 'VP8X' && length >= 10) return { format: 'webp', width: 1 + bytes.readUIntLE(start + 4, 3), height: 1 + bytes.readUIntLE(start + 7, 3) };
      if (type === 'VP8L' && length >= 5 && bytes[start] === 0x2f) {
        const bits = bytes.readUInt32LE(start + 1);
        return { format: 'webp', width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
      }
      if (type === 'VP8 ' && length >= 10 && bytes.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 1, 0x2a])))
        return { format: 'webp', width: bytes.readUInt16LE(start + 6) & 0x3fff, height: bytes.readUInt16LE(start + 8) & 0x3fff };
      at = start + length + (length % 2);
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    for (let at = 2; at + 4 <= bytes.length;) {
      if (bytes[at++] !== 0xff) continue;
      while (bytes[at] === 0xff) at++;
      const marker = bytes[at++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 1 || marker >= 0xd0 && marker <= 0xd8) continue;
      if (at + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(at);
      if (length < 2 || at + length > bytes.length) break;
      if (sof.has(marker) && length >= 8) return { format: 'jpeg', width: bytes.readUInt16BE(at + 5), height: bytes.readUInt16BE(at + 3) };
      at += length;
    }
  }
  if (bytes.length >= 48 && bytes.subarray(0, 12).equals(Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 13, 10, 26, 10])))
    return { format: 'ktx2', width: bytes.readUInt32LE(20), height: bytes.readUInt32LE(24), declaredMipLevels: bytes.readUInt32LE(40) };
  return null;
}

function logicalRgba(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) return null;
  const base = width * height * 4;
  let mipmapped = 0, levels = 0;
  for (let w = width, h = height;; w = Math.max(1, Math.floor(w / 2)), h = Math.max(1, Math.floor(h / 2))) {
    mipmapped += w * h * 4; levels++;
    if (w === 1 && h === 1) break;
  }
  return { baseBytes: base, fullMipmapBytes: mipmapped, levels };
}

function parseGlb(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length)
    throw Error('Not a complete glTF 2 binary');
  let document, bin;
  for (let at = 12; at + 8 <= bytes.length;) {
    const length = bytes.readUInt32LE(at), type = bytes.readUInt32LE(at + 4), start = at + 8;
    if (start + length > bytes.length) throw Error('GLB chunk is out of bounds');
    if (type === 0x4e4f534a) document = JSON.parse(bytes.toString('utf8', start, start + length));
    if (type === 0x004e4942) bin = bytes.subarray(start, start + length);
    at = start + length;
  }
  if (!document) throw Error('GLB has no JSON chunk');
  return { document, bin };
}

function materialSlots(document) {
  const slots = [];
  for (const [material, value] of (document.materials ?? []).entries()) {
    const visit = (node, path) => {
      if (!node || typeof node !== 'object') return;
      for (const [key, child] of Object.entries(node)) {
        const next = path ? path + '.' + key : key;
        if (key.endsWith('Texture') && Number.isInteger(child?.index)) slots.push({
          material, materialName: value.name ?? null, slot: next, texture: child.index,
          texCoord: child.extensions?.KHR_texture_transform?.texCoord ?? child.texCoord ?? 0,
          transform: child.extensions?.KHR_texture_transform ?? null,
        });
        else visit(child, next);
      }
    };
    visit(value, '');
  }
  return slots;
}

async function inspectAsset(url, references) {
  const file = publicFile(url), bytes = await optional(file);
  const base = { url, references, buildGuardAvailable: hasCharacterModel(pathToFileURL(file)) };
  if (!bytes) return { ...base, status: 'missing' };
  const pointer = bytes.length < 1024 && bytes.toString('utf8').match(/^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\nsize (\d+)/);
  if (pointer) return { ...base, status: 'lfs-pointer', pointerBytes: bytes.length, declaredBytes: Number(pointer[2]), declaredSha256: pointer[1] };
  let parsed;
  try { parsed = parseGlb(bytes); }
  catch (error) { return { ...base, status: 'invalid', bytes: bytes.length, sha256: sha256(bytes), error: error.message }; }
  const { document: d, bin } = parsed, slots = materialSlots(d);
  const textureDefinitions = (d.textures ?? []).map((texture, index) => {
    const sources = [];
    if (Number.isInteger(texture.source)) sources.push({ image: texture.source, kind: 'source' });
    for (const [extension, value] of Object.entries(texture.extensions ?? {})) if (Number.isInteger(value.source)) sources.push({ image: value.source, kind: extension });
    const sampler = d.samplers?.[texture.sampler] ?? {};
    return { index, sources, sampler: { minFilter: sampler.minFilter ?? 9987, magFilter: sampler.magFilter ?? 9729,
      wrapS: sampler.wrapS ?? 10497, wrapT: sampler.wrapT ?? 10497 }, materialSlots: slots.filter(slot => slot.texture === index) };
  });
  const images = [];
  for (const [index, image] of (d.images ?? []).entries()) {
    let payload, problem, location = 'embedded';
    if (Number.isInteger(image.bufferView)) {
      const view = d.bufferViews?.[image.bufferView], offset = view?.byteOffset ?? 0;
      if (!bin || !view || (view.buffer ?? 0) !== 0 || offset + view.byteLength > bin.length) problem = 'Image bufferView unavailable/out of bounds';
      else payload = bin.subarray(offset, offset + view.byteLength);
    } else if (image.uri?.startsWith('data:')) {
      const data = image.uri.match(/^data:[^,]*;base64,(.*)$/s);
      if (data) payload = Buffer.from(data[1], 'base64'); else problem = 'Unsupported data URI';
    } else if (image.uri && !/^[a-z]+:/i.test(image.uri)) {
      location = 'external-file';
      const target = resolve(dirname(file), image.uri);
      if (relative(publicRoot, target).startsWith('..')) problem = 'Image path escapes public root';
      else { payload = await optional(target); if (!payload) problem = 'External image file is missing'; }
    } else problem = 'External image URI was not fetched';
    const dimensions = payload && imageDimensions(payload);
    const textures = textureDefinitions.filter(texture => texture.sources.some(source => source.image === index));
    const materialReferences = textures.flatMap(texture => texture.materialSlots.map(slot => ({ ...slot, sampler: texture.sampler,
      imageSourceKind: texture.sources.filter(source => source.image === index).map(source => source.kind) })));
    images.push({ index, name: image.name ?? null, mimeType: image.mimeType ?? null, location,
      uri: image.uri?.startsWith('data:') ? '[embedded data URI]' : image.uri ?? null,
      ...(payload ? { bytes: payload.length, sha256: sha256(payload) } : {}),
      ...(dimensions ?? {}), ...(problem ? { problem } : !dimensions ? { problem: 'Image dimensions not recognized; estimate omitted' } : {}),
      textureDefinitionCount: textures.length, materialReferenceCount: materialReferences.length,
      samplerVariantCount: new Set(textures.map(texture => JSON.stringify(texture.sampler))).size,
      referencedMaterialCount: new Set(materialReferences.map(reference => reference.material)).size,
      materialReferences, logicalRgba: dimensions ? logicalRgba(dimensions.width, dimensions.height) : null });
  }
  // WebP extensions can provide an alternative to PNG/JPEG, not another simultaneous map.
  // These are conditional material-definition inventories; no browser support is assumed.
  const materialImageProfiles = Object.fromEntries(['defaultSources', 'preferWebP'].map(profile => {
    const indices = new Set(), unresolvedTextures = [];
    for (const texture of textureDefinitions.filter(texture => texture.materialSlots.length)) {
      const source = (profile === 'preferWebP' ? texture.sources.find(source => source.kind === 'EXT_texture_webp') : undefined)
        ?? texture.sources.find(source => source.kind === 'source');
      if (source && images[source.image]) indices.add(source.image); else unresolvedTextures.push(texture.index);
    }
    const selected = [...indices].sort((a, b) => a - b).map(index => images[index]);
    return [profile, { imageIndices: selected.map(image => image.index), unresolvedTextures,
      imagePayloadBytes: selected.reduce((sum, image) => sum + (image.bytes ?? 0), 0),
      logicalRgbaFullMipmapBytes: selected.reduce((sum, image) => sum + (image.logicalRgba?.fullMipmapBytes ?? 0), 0),
      unknownDimensionImages: selected.filter(image => !image.logicalRgba).length }];
  }));
  const primitives = (d.meshes ?? []).flatMap(mesh => mesh.primitives ?? []);
  const meshInstances = (d.nodes ?? []).filter(node => node.mesh !== undefined);
  const primitiveInstances = meshInstances.flatMap(node => d.meshes[node.mesh]?.primitives ?? []);
  const countTriangles = primitive => (primitive.mode ?? 4) === 4 ? (d.accessors?.[primitive.indices]?.count ?? d.accessors?.[primitive.attributes?.POSITION]?.count ?? 0) / 3 : 0;
  return { ...base, status: 'installed', bytes: bytes.length, sha256: sha256(bytes),
    gltf: { nodes: d.nodes?.length ?? 0, meshes: d.meshes?.length ?? 0, meshInstances: meshInstances.length,
      primitiveDefinitions: primitives.length, primitiveInstances: primitiveInstances.length,
      nonTrianglePrimitiveInstances: primitiveInstances.filter(primitive => (primitive.mode ?? 4) !== 4).length,
      triangleInstances: primitiveInstances.reduce((sum, primitive) => sum + countTriangles(primitive), 0),
      materialCount: d.materials?.length ?? 0, textureDefinitionCount: textureDefinitions.length,
      materialTextureSlotCount: slots.length, skinCount: d.skins?.length ?? 0, animationCount: d.animations?.length ?? 0,
      extensions: d.extensionsUsed ?? [], uvSets: [...new Set(primitives.flatMap(primitive => Object.keys(primitive.attributes ?? {}).filter(name => name.startsWith('TEXCOORD_'))))].sort() },
    materials: (d.materials ?? []).map((material, index) => ({ index, name: material.name ?? null, alphaMode: material.alphaMode ?? 'OPAQUE',
      primitiveReferenceCount: primitiveInstances.filter(primitive => primitive.material === index).length,
      textureSlotCount: slots.filter(slot => slot.material === index).length })), images, materialImageProfiles,
    imagePayloadBytes: images.reduce((sum, image) => sum + (image.bytes ?? 0), 0),
    referencedImageCount: images.filter(image => image.materialReferenceCount > 0).length,
    imageInstances: images.length,
    logicalRgbaFullMipmapBytes: images.reduce((sum, image) => sum + (image.logicalRgba?.fullMipmapBytes ?? 0), 0),
    referencedLogicalRgbaFullMipmapBytes: images.reduce((sum, image) => sum + (image.materialReferenceCount ? image.logicalRgba?.fullMipmapBytes ?? 0 : 0), 0),
    unknownDimensionImages: images.filter(image => !image.logicalRgba).length };
}

async function glbFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await glbFiles(path));
    else if (entry.isFile() && /\.glb$/i.test(entry.name)) files.push(path);
  }
  return files;
}

function inventory(assets) {
  const installed = assets.filter(asset => asset.status === 'installed'), unique = new Map();
  const occurrences = installed.flatMap(asset => asset.images.map(image => ({ asset: asset.url, ...image })));
  for (const image of occurrences) if (image.sha256 && !unique.has(image.sha256)) unique.set(image.sha256, image);
  const images = [...unique.values()];
  return { paths: assets.length, installed: installed.length, lfsPointers: assets.filter(asset => asset.status === 'lfs-pointer').length,
    missing: assets.filter(asset => asset.status === 'missing').length, invalid: assets.filter(asset => asset.status === 'invalid').length,
    installedFileBytes: installed.reduce((sum, asset) => sum + asset.bytes, 0), imageInstances: occurrences.length,
    byteIdenticalUniqueImages: unique.size, imagePayloadBytes: occurrences.reduce((sum, image) => sum + (image.bytes ?? 0), 0),
    uniqueImagePayloadBytes: images.reduce((sum, image) => sum + image.bytes, 0),
    logicalRgbaFullMipmapBytes: occurrences.reduce((sum, image) => sum + (image.logicalRgba?.fullMipmapBytes ?? 0), 0),
    uniqueLogicalRgbaFullMipmapBytes: images.reduce((sum, image) => sum + (image.logicalRgba?.fullMipmapBytes ?? 0), 0),
    unknownDimensionImages: occurrences.filter(image => !image.logicalRgba).length };
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('node frontend/scripts/audit-asset-residency.mjs > asset-residency.json\nReads repository catalogs and installed character/vehicle GLBs; never decodes pixels, fetches remote URIs, resizes, exports, loads a renderer or changes runtime assets.');
    return;
  }
  const refs = new Map();
  const add = (url, reference) => {
    if (!url || !url.startsWith('/') || !/\.glb(?:[?#]|$)/i.test(url)) return;
    const fileUrl = url.split(/[?#]/, 1)[0], values = refs.get(fileUrl) ?? [];
    const entry = { ...reference, requestedUrl: url };
    if (!values.some(value => JSON.stringify(value) === JSON.stringify(entry))) values.push(entry);
    refs.set(fileUrl, values);
  };
  const curated = await json(resolve(catalogRoot, 'character-garments.json'));
  const discovered = await json(resolve(catalogRoot, 'discovered-wardrobe-garments.json'));
  const sets = await json(resolve(catalogRoot, 'character-wardrobe.json'));
  const vehicleCatalog = await json(resolve(frontend, 'src/vehicles/generated/assetCatalog.json'));
  const publicVehicleCatalog = await json(resolve(publicRoot, 'models/vehicles/catalog.json'));
  const active = [...curated.filter(item => !item.retired), ...discovered];
  const garments = [];
  for (const item of [...curated, ...discovered]) {
    for (const field of ['url', 'mobileUrl', 'revisionUrl']) add(item[field], { kind: 'garment', id: item.id, slot: item.slot, field, retired: Boolean(item.retired) });
    if (!active.includes(item)) continue;
    const fullAvailable = Boolean(item.url && hasCharacterModel(pathToFileURL(publicFile(item.url))));
    const mobileAvailable = Boolean(item.mobileUrl && hasCharacterModel(pathToFileURL(publicFile(item.mobileUrl))));
    const revisionCompatible = Boolean(item.revisionUrl && item.url && hasCompatibleWardrobeRevision(pathToFileURL(publicFile(item.revisionUrl)), pathToFileURL(publicFile(item.url))));
    const select = portrait => !fullAvailable ? mobileAvailable ? item.mobileUrl : null
      : revisionCompatible ? item.revisionUrl : portrait && mobileAvailable ? item.mobileUrl : item.url;
    garments.push({ id: item.id, slot: item.slot, url: item.url ?? null, mobileUrl: item.mobileUrl ?? null, revisionUrl: item.revisionUrl ?? null,
      fullAvailable, mobileAvailable, revisionCompatible, selectedGarage: select(false), selectedPortrait: select(true) });
  }
  const bundles = [];
  for (const set of sets) {
    const row = { id: set.id, retired: Boolean(set.retired) };
    for (const tier of ['garage', 'mobile']) {
      const url = `/models/characters/wardrobe/${set.id}.${tier}.glb`; add(url, { kind: 'bundle', id: set.id, tier, retired: row.retired });
      row[tier] = { url, available: hasCharacterModel(pathToFileURL(publicFile(url))) };
    }
    bundles.push(row);
  }
  const corsets = [];
  const corsetIds = [...sets.map(set => set.id), 'gothic-laced-bodice', 'gothic-underbust-vest', 'gothic-underbust-vest-original-cut', 'gothic-underbust-vest-tucked', 'gothic-high-collar'];
  for (const id of corsetIds) {
    const row = { id };
    for (const tier of ['garage', 'mobile']) {
      const url = `/models/characters/female/wardrobe/corsets/${id}.${tier}.glb`; add(url, { kind: 'corset', id, tier, optionalProbe: true });
      row[tier] = { url, available: hasCharacterModel(pathToFileURL(publicFile(url))) };
    }
    corsets.push(row);
  }
  const female = findVillagerModel('female'), male = findVillagerModel('male');
  const vesper = vesperActorUrls(female), packed = installedPackedVesperPortrait(female);
  const actors = { female: { garage: vesper.model, portrait: packed ?? vesper.portrait, portraitFallback: vesper.portrait },
    male: { garage: characterLod(male, 'garage') ?? male?.sourceUrl ?? null, portrait: characterLod(male, 'portrait') ?? male?.sourceUrl ?? null } };
  for (const [gender, tiers] of Object.entries(actors)) for (const [tier, url] of Object.entries(tiers)) add(url, { kind: 'actor', gender, tier });
  for (const url of ['/models/characters/female/wardrobe/vesper-body.glb', '/models/characters/wardrobe/gothic-02.mobile.glb']) add(url, { kind: 'body-donor' });
  const vehicles = [];
  for (const [id, asset] of Object.entries(vehicleCatalog.assets)) {
    add(asset.model, { kind: 'vehicle', id, group: asset.group, tier: 'full' });
    for (const [tier, url] of Object.entries(asset.lods ?? {})) add(url, { kind: 'vehicle', id, group: asset.group, tier });
    for (const [variant, url] of Object.entries(asset.variants ?? {})) add(url, { kind: 'vehicle-variant', id, group: asset.group, variant });
    vehicles.push({ id, group: asset.group, model: asset.model, tiers: Object.fromEntries(['near', 'medium', 'far'].map(tier => [tier, {
      url: asset.lods?.[tier] ?? asset.model, distinctFromFull: Boolean(asset.lods?.[tier] && asset.lods[tier] !== asset.model),
    }])) });
  }
  const heroBytes = await optional(resolve(publicRoot, 'models/heroes-generated/previews.json'));
  const heroes = heroBytes ? JSON.parse(heroBytes.toString()) : {};
  for (const [id, url] of Object.entries(heroes)) add(url, { kind: 'heroes-generated', id });
  for (const directory of ['models/characters', 'models/vehicles', 'models/heroes-generated']) {
    for (const file of await glbFiles(resolve(publicRoot, directory))) add('/' + relative(publicRoot, file).replaceAll('\\', '/'), { kind: 'disk-inventory' });
  }
  const assets = [];
  for (const [url, references] of [...refs].sort(([a], [b]) => a.localeCompare(b))) assets.push(await inspectAsset(url, references));
  const byUrl = new Map(assets.map(asset => [asset.url, asset]));
  const status = url => url ? byUrl.get(url.split(/[?#]/, 1)[0])?.status ?? 'unlisted' : 'not-selected';
  for (const garment of garments) {
    garment.fullStatus = status(garment.url); garment.mobileStatus = status(garment.mobileUrl);
    garment.revisionStatus = status(garment.revisionUrl);
    garment.garageStatus = status(garment.selectedGarage); garment.portraitStatus = status(garment.selectedPortrait);
    garment.portraitUsesDistinctFile = Boolean(garment.selectedPortrait && garment.selectedPortrait !== garment.selectedGarage);
  }
  for (const vehicle of vehicles) {
    vehicle.modelStatus = status(vehicle.model);
    for (const tier of Object.values(vehicle.tiers)) tier.status = status(tier.url);
  }
  const groups = {
    characterDiskInventory: asset => asset.url.startsWith('/models/characters/'),
    vehicleDiskInventory: asset => asset.url.startsWith('/models/vehicles/'),
    gothicGarageBundles: asset => asset.references.some(reference => reference.kind === 'bundle' && reference.tier === 'garage'),
    gothicMobileBundles: asset => asset.references.some(reference => reference.kind === 'bundle' && reference.tier === 'mobile'),
    activeGothicGarageBundles: asset => asset.references.some(reference => reference.kind === 'bundle' && reference.tier === 'garage' && !reference.retired),
    activeGothicMobileBundles: asset => asset.references.some(reference => reference.kind === 'bundle' && reference.tier === 'mobile' && !reference.retired),
    standaloneGarageCorsets: asset => asset.references.some(reference => reference.kind === 'corset' && reference.tier === 'garage'),
    standaloneMobileCorsets: asset => asset.references.some(reference => reference.kind === 'corset' && reference.tier === 'mobile'),
    activeGarageGarmentSelections: asset => garments.some(garment => garment.selectedGarage === asset.url),
    activePortraitGarmentSelections: asset => garments.some(garment => garment.selectedPortrait === asset.url),
    landFullModels: asset => asset.references.some(reference => reference.kind === 'vehicle' && reference.group === 'land' && reference.tier === 'full'),
    landReducedModels: asset => asset.references.some(reference => reference.kind === 'vehicle' && reference.group === 'land' && reference.tier !== 'full'),
  };
  const duplicates = new Map();
  for (const asset of assets) for (const image of asset.images ?? []) if (image.sha256) {
    const list = duplicates.get(image.sha256) ?? [];
    list.push({ asset: asset.url, image: image.index, name: image.name, bytes: image.bytes, width: image.width, height: image.height,
      materialReferenceCount: image.materialReferenceCount, logicalRgbaFullMipmapBytes: image.logicalRgba?.fullMipmapBytes ?? null });
    duplicates.set(image.sha256, list);
  }
  const duplicateImages = [...duplicates].filter(([, images]) => images.length > 1).map(([hash, images]) => ({
    sha256: hash, occurrences: images.length, distinctAssets: new Set(images.map(image => image.asset)).size,
    repeatedPayloadBytes: images.slice(1).reduce((sum, image) => sum + image.bytes, 0), images,
  })).sort((a, b) => b.repeatedPayloadBytes - a.repeatedPayloadBytes);
  const evidencePaths = ['vite.config.ts', 'scripts/character-model-paths.mts', 'src/game/characters/GarageDriver.tsx',
    'src/game/characters/wardrobeGarments.ts', 'src/game/characters/wardrobePreviewAssets.ts', 'src/game/characters/wardrobeBody.ts',
    'src/game/characters/wardrobe.ts', 'src/game/characters/wardrobeFitCache.ts', 'src/vehicles/fleetAssets.ts',
    'src/vehicles/assetCatalog.ts', 'src/game/preview/VehiclePreviewModel.tsx', 'src/game/preview/disposeVehicleAsset.ts',
    'src/vehicles/generated/assetCatalog.json', 'public/models/vehicles/catalog.json', 'scripts/audit-asset-residency.mjs'];
  const sourceEvidence = [];
  for (const path of evidencePaths) sourceEvidence.push({ path: 'frontend/' + path, sha256: sha256(await readFile(resolve(frontend, path))) });
  for (const path of ['character-garments.json', 'discovered-wardrobe-garments.json', 'character-wardrobe.json'])
    sourceEvidence.push({ path: 'packages/wardrobe-catalog/' + path, sha256: sha256(await readFile(resolve(catalogRoot, path))) });
  const report = {
    schema: 1, audit: 'static-source-and-image-metadata', generatedAt: new Date().toISOString(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
    methodology: {
      scope: 'All local GLBs under public/models/characters, public/models/vehicles and public/models/heroes-generated, plus catalog-selected/optional paths.',
      logicalTextureEstimate: 'RGBA8 width × height × 4 bytes, plus an exact complete 2D mip chain down to 1×1. This is an image-inventory comparison, NOT measured browser residency, decoded heap, driver allocations or VRAM.',
      duplicateDefinition: 'SHA-256 of identical encoded image payload bytes. Different encodings of identical pixels are not deduplicated; no pixels are decoded.',
      totalsCaution: 'Inventory groups overlap and are not all loaded simultaneously. Image entries include unused/fallback alternatives; referenced counts are provided separately. Sampler behavior, channels/formats, compressed GPU textures, image/texture clones, render targets and alignment change actual residency.',
      sourceProfiles: 'Per-asset defaultSources and preferWebP choose one image candidate per material-referenced texture definition, collapsing shared image indices. They are conditional metadata views, not loaded-image measurements; unresolvedTextures marks candidates with no compatible source. Material references include definitions whether or not the resulting mesh is visible. KTX2/Basis alternatives are inventoried separately, not assumed supported.',
      selection: 'Garment selections reproduce wardrobeGarmentModelUrl using the production availability/revision guards. Portrait means compact preview (component width ≤960), not a platform-wide mobile toggle. Bundles/corsets report available candidate tiers; runtime rig-fit fallback is not simulated.',
      noMutation: 'No runtime sources, GLBs, textures, exports or cache policies are modified. No remote image URI is fetched.',
    },
    catalogs: { vehicleRuntimeMirrorMatchesPublic: JSON.stringify(vehicleCatalog) === JSON.stringify(publicVehicleCatalog),
      curatedEntries: curated.length, discoveredEntries: discovered.length, activeImportedEntries: active.length },
    inventory: inventory(assets), inventories: Object.fromEntries(Object.entries(groups).map(([name, predicate]) => [name, inventory(assets.filter(predicate))])),
    coverage: { actors, garments, bundles, corsets, vehicles, heroes,
      garmentSummary: { active: garments.length, declaredMobile: garments.filter(item => item.mobileUrl).length,
        availableMobile: garments.filter(item => item.mobileAvailable).length, compatibleRevisionOverrides: garments.filter(item => item.revisionCompatible).length,
        mobileLfsPointers: garments.filter(item => item.mobileStatus === 'lfs-pointer').length,
        noDeclaredMobile: garments.filter(item => !item.mobileUrl).length,
        installedGarageSelections: garments.filter(item => item.garageStatus === 'installed').length,
        installedPortraitSelections: garments.filter(item => item.portraitStatus === 'installed').length,
        portraitUsesDistinctFile: garments.filter(item => item.portraitUsesDistinctFile).length,
        portraitUsesGarageFile: garments.filter(item => item.selectedPortrait && item.selectedPortrait === item.selectedGarage).length } },
    oversizedImages: assets.flatMap(asset => (asset.images ?? []).filter(image => Math.max(image.width ?? 0, image.height ?? 0) > 2048)
      .map(image => ({ asset: asset.url, image: image.index, name: image.name, width: image.width, height: image.height, bytes: image.bytes,
        sha256: image.sha256, materialReferenceCount: image.materialReferenceCount, logicalRgbaFullMipmapBytes: image.logicalRgba?.fullMipmapBytes ?? null })))
      .sort((a, b) => (b.logicalRgbaFullMipmapBytes ?? 0) - (a.logicalRgbaFullMipmapBytes ?? 0)),
    duplicateImages, sourceEvidence, assets,
  };
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { imageDimensions, logicalRgba, parseGlb };
