import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addPiece, emptyLayout, layoutJSON, parseLayoutText, parseLayout } from '../src/worldBuilder/document/layoutDocument.ts';
import { colliderBox, excavateRoute, presetPath, passageObstructions } from '../src/worldBuilder/generation/excavation.ts';
import { harborExchange } from '../src/worldBuilder/generation/harborExchange.ts';
import { waterSurfaceAt } from '../src/worldBuilder/generation/waterRegions.ts';
import { mapExport, parseMapText } from '../src/worldBuilder/document/mapDocument.ts';

const base = () => ({ ...emptyLayout('test'), ground: false, repeat: false });
const options = overrides => ({ kind: 'tunnel', points: [[0, 2, -44], [0, 2, 44]], width: 12, height: 7, depth: 6, resolution: 2, rails: true, waterfall: false, ...overrides });
// Independent point containment against the actual exported boxes, including yaw and incline.
function occupies(o, point) {
  if (!o.solid) return false;
  const angle = o.yaw * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const dx = point[0] - o.position[0], dz = point[2] - o.position[2];
  const local = [c * dx - s * dz, point[1] - o.position[1], s * dx + c * dz];
  return o.parts.some(p => {
    if (p.solid === false || p.shape !== 'box') return false;
    const v = local.map((n, i) => n - p.position[i] * o.size[i]);
    v[1] -= (p.rise ?? 0) * o.size[1] * v[0] / (p.size[0] * o.size[0]);
    return v.every((n, i) => Math.abs(n) < p.size[i] * o.size[i] / 2 - 1e-6);
  });
}
test('rotated and resized mountains retain a physical roof and floor around a clear tunnel', () => {
  const doc = base();
  doc.objects.push(colliderBox('hill', 'mountain-test', [0, -4, 0], [72, 36, 72], '#667766', 37));
  const before = structuredClone(doc), result = excavateRoute(doc, options());
  assert.deepEqual(doc, before, 'preview does not mutate the draft');
  assert.equal(result.changed, 1);
  assert.deepEqual(result.obstructions, []);
  for (let z = -43; z <= 43; z += 1) for (const x of [-5.8, 0, 5.8]) for (const y of [2.1, 5, 8.9])
    assert(!result.doc.objects.some(o => occupies(o, [x, y, z])), `clear bore at ${x},${y},${z}`);
  assert(result.doc.objects.some(o => occupies(o, [0, 1.8, 0])));
  assert(result.doc.objects.some(o => occupies(o, [0, 9.2, 0])));
  assert.deepEqual(parseLayoutText(layoutJSON(result.doc)), result.doc);
});
test('curved cuts remove actual mountain collision while respecting locked and unrelated objects', () => {
  const doc = base(), points = presetPath(84, 90, [-24, 0, -24], 24);
  doc.objects.push(colliderBox('hill', 'mountain-test', [10, -4, 5], [144, 44, 144]));
  const manual = colliderBox('manual', 'building', [200, 0, 200], [8, 8, 8]);
  doc.objects.push(manual);
  const result = excavateRoute(doc, options({ kind: 'road', points }));
  for (const p of points) assert(!result.doc.objects.some(o => occupies(o, [p[0], 3, p[2]])));
  assert.deepEqual(result.doc.objects.find(o => o.id === 'manual'), manual);
  assert(!result.doc.objects.some(o => occupies(o, [points[8][0], 30, points[8][2]])), 'open cutting has no hidden roof');
  doc.objects[0].locked = true;
  const locked = excavateRoute(doc, options({ points }));
  assert.deepEqual(locked.doc.objects[0], doc.objects[0]);
  assert(locked.obstructions.includes('hill'));
});
test('canal beds support hulls, water is nonsolid, and waterfall rock deliberately ends the route', () => {
  const doc = base();
  doc.objects.push(colliderBox('hill', 'mountain-test', [0, -12, 0], [80, 50, 80]));
  const result = excavateRoute(doc, options({ kind: 'canal-tunnel', waterfall: true }));
  assert.equal(waterSurfaceAt(result.doc.objects, 0, 0), 2);
  assert.equal(waterSurfaceAt(result.doc.objects, 100, 0), null);
  assert(!result.doc.objects.some(o => occupies(o, [0, -3, 0])));
  assert(result.doc.objects.some(o => occupies(o, [0, -4.2, 0])));
  assert(result.doc.objects.some(o => occupies(o, [0, 4, 46])));
  assert(result.doc.objects.filter(o => o.piece === 'excavated-water').every(o => !o.solid && o.parts.every(p => !p.solid)));
  assert.deepEqual(result.obstructions, []);
  for (const flag of [{ ground: true }, { repeat: true }, { base: 'overlay' }])
    assert.throws(() => excavateRoute({ ...doc, ...flag }, options({ kind: 'canal' })), /finite standalone/);
});
test('waterway clearance distinguishes an overhead crossing from a blocking support', () => {
  const guide = colliderBox('guide', 'guide', [0, -6, 0], [12, 13, 40]);
  const bridge = colliderBox('bridge', 'bridge', [0, 8, 0], [40, 1, 8]);
  const pier = colliderBox('pier', 'pier', [0, -8, 0], [2, 16, 2]);
  assert.deepEqual(passageObstructions([bridge], [guide]), []);
  assert.deepEqual(passageObstructions([bridge, pier], [guide]), ['pier']);
});
test('all mountain presets place successfully and budgets reject oversize generated documents', () => {
  for (const piece of ['mountain-segment-small', 'mountain-segment-standard', 'mountain-segment-long', 'mountain-segment-broad', 'mountain-curved-tunnel', 'mountain-canal-cut'])
    assert.doesNotThrow(() => addPiece(base(), piece, [0, 0, 0]), piece);
  assert.throws(() => excavateRoute(base(), options({ width: NaN })), /width/);
  assert.throws(() => excavateRoute(base(), options({ kind: 'canal', points: [[0, 0, 0], [0, 2, 10]] })), /level/);
  const doc = base(), box = colliderBox('box', 'box', [0, 0, 0], [1, 1, 1]);
  box.parts = Array.from({ length: 512 }, () => box.parts[0]);
  doc.objects = Array.from({ length: 33 }, (_, i) => ({ ...box, id: `box-${i}` }));
  assert.throws(() => parseLayout(doc), /16384/);
});
test('Harbor Exchange exports only explicit collision geometry with connected ramp endpoints', () => {
  const doc = harborExchange(), installed = parseMapText(fs.readFileSync(new URL('../../avenlab-server/src/assets/blocks/harbor_exchange_colliders.json', import.meta.url), 'utf8'));
  assert.deepEqual(installed.authored_layout, doc);
  assert.deepEqual(parseMapText(mapExport(installed)), installed);
  assert.equal(doc.ground, false); assert.equal(doc.repeat, false); assert.equal(doc.base, 'replace');
  assert.equal(installed.visuals.length + installed.roads.length + installed.buildings.length, 0);
  assert(doc.objects.reduce((n, o) => n + o.parts.length, 0) < 700);
  for (let z = -98; z <= 98; z += 2) for (const x of [-71.5, -66, -60.5, 56.5, 62, 67.5])
    assert(!doc.objects.some(o => occupies(o, [x, 2, z])), `drive corridor ${x},${z}`);
  for (let z = -100; z < 114; z += 2) {
    assert.equal(waterSurfaceAt(doc.objects, 0, z), -2);
    assert(!doc.objects.some(o => occupies(o, [0, -1, z])), `navigation channel at ${z}`);
  }
  for (const ramp of doc.objects.filter(o => o.piece === 'exchange-ramp')) for (const t of [.01, .5, .99]) {
    const z = ramp.position[2] + (t - .5) * ramp.size[0];
    assert(doc.objects.some(o => occupies(o, [ramp.position[0], t * 10 - .05, z])), `ramp support at ${z}`);
  }
});

test('graded floors follow the centreline and shoulders widen the physical corridor',()=>{
 for(const grade of [-25,25]){
 const points=presetPath(24,0,[0,5,0],0,grade);
 const result=excavateRoute(base(),options({points,shoulder:3}));
 const floors=result.doc.objects.filter(o=>o.piece==='excavated-road');
 for(let i=0;i<floors.length;i++){
 const a=points[i],b=points[i+1],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2-.1,(a[2]+b[2])/2];
 assert(occupies(floors[i],mid));assert(floors[i].parts[0].rise);
 assert(floors[i].size[2]>18);
 }
 assert.equal(points.at(-1)[1],5+24*grade/100);
 }
 assert.throws(()=>excavateRoute(base(),options({points:[[0,0,0],[0,4,10]]})),/30%/);
});
