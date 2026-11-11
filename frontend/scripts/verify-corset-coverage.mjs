import assert from 'node:assert/strict';
import { AnimationMixer, BufferGeometry, DoubleSide, Float32BufferAttribute, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// Sample the protected front and upper back on the exact loaded body. Track
// those same triangles through poses so arms in front do not hide fit defects.
const zones = {
  chest: (p, n) => p.z > .083 && Math.abs(p.x) > .037 && Math.abs(p.x) < .09 && p.y > 1.252 && p.y < 1.292 && n.z > .35,
  rightCup: (p, n) => p.x > -.092 && p.x < -.055 && p.y > 1.299 && p.y < 1.312 && p.z > .072 && n.z > .18,
  bust: (p, n) => p.z > .081 && Math.abs(p.x) > .035 && Math.abs(p.x) < .096 && p.y > 1.244 && p.y < 1.296 && n.z > .32,
  bustTips: (p, n) => p.z > .121 && Math.abs(p.x) > .047 && Math.abs(p.x) < .079 && p.y > 1.215 && p.y < 1.24 && n.z > .3,
  back: (p, n) => p.z < -.025 && Math.abs(p.x) < .105 && p.y > 1.33 && p.y < 1.405 && n.z < -.35,
  shoulders: (p, n) => Math.abs(p.x) > .08 && Math.abs(p.x) < .139 && p.y > 1.36 && p.y < 1.414 && n.y > .2,
  outerShoulders: (p, n) => Math.abs(p.x) > .139 && Math.abs(p.x) < .155 && p.y > 1.359 && p.y < 1.424
    && p.z > -.064 && p.z < .05 && n.y > .1,
  collarCrest: (p, n) => Math.abs(p.x) > .05 && Math.abs(p.x) < .166 && p.y > 1.364 && p.y < 1.444
    && p.z > -.061 && p.z < .048 && n.y > .15,
  rearShoulderPanels: (p, n) => Math.abs(p.x) > .072 && Math.abs(p.x) < .169 && p.y > 1.353 && p.y < 1.421
    && p.z < -.025 && n.z < -.16,
  rearStraps: (p, n) => p.z < -.04 && Math.abs(p.x) > .095 && Math.abs(p.x) < .132 && p.y > 1.345 && p.y < 1.398 && n.z < -.3,
  leftRearStrap: (p, n) => p.x > .099 && p.x < .117 && p.y > 1.352 && p.y < 1.382 && p.z < -.068 && n.z < -.35,
};

const highCollarShoulderZones = ['collarCrest', 'rearShoulderPanels'];
const shoulderViews = [
  [0, 0, 1], [0, 0, -1], [0, 1, 0],
  [.65, .45, .58], [.65, .45, -.58], [.65, .75, 0], [.85, .2, -.42],
].map(view => new Vector3(...view).normalize());

// The Sweetheart neckline needs clearance where the cup turns around the
// underarm and on the inside edges of the center opening.
const sweetheartEdges = {
  underarm: {
    select: (p, n) => p.x > -.117 && p.x < -.101 && p.y > 1.285 && p.y < 1.290 && p.z > .043 && p.z < .066 && n.z > .12,
    view: new Vector3(-.438, 0, .899).normalize(),
  },
  innerCups: {
    select: (p, n) => n.z > .12 && (
      (p.x > -.035 && p.x < -.018 && p.y > 1.2838 && p.y < 1.303 && p.z > .095 && p.z < .105)
      || (p.x > .035 && p.x < .044 && p.y > 1.285 && p.y < 1.300 && p.z > .096 && p.z < .106)
    ),
    view: new Vector3(0, 0, 1),
  },
};

function posedVertices(mesh) {
  const points = new Float32Array(mesh.geometry.getAttribute('position').count * 3);
  const point = new Vector3();
  for (let i = 0; i < points.length / 3; i++) mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).toArray(points, i * 3);
  return points;
}

function visibleIndices(mesh) {
  const { index, drawRange } = mesh.geometry;
  return index.array.subarray(drawRange.start, drawRange.start + drawRange.count);
}

function surfaceFromVertices(points, indices) {
  return new MeshBVH(new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute(points, 3))
    .setIndex(Array.from(indices)));
}

function posedSurface(mesh) {
  return surfaceFromVertices(posedVertices(mesh), visibleIndices(mesh));
}

function verifyRaisedShoulder(label, ray, center, direction, skin, corsets) {
  // At full reach skin folds can invert a face normal. Check the front, back,
  // and top silhouettes when this shoulder point is visible from those views.
  for (const [y, z] of [[0, 1], [0, -1], [1, 0]]) {
    direction.set(0, y, z);
    ray.origin.copy(center).addScaledVector(direction, .1);
    ray.direction.copy(direction).negate();
    const skinHit = skin.raycastFirst(ray, DoubleSide)?.distance ?? Infinity;
    if (skinHit < .0999) continue;
    assert(corsets.some(surface => (surface.raycastFirst(ray, DoubleSide)?.distance ?? Infinity) < .100001),
      `${label} leaves an outer shoulder exposed from an external view`);
  }
}

function verifyShoulderViews(label, ray, center, normal, side, direction, skin, corsets) {
  let visibleViews = 0;
  for (const view of shoulderViews) {
    direction.set(side * view.x, view.y, view.z);
    if (normal.dot(direction) < .08) continue;
    ray.origin.copy(center).addScaledVector(direction, .22);
    ray.direction.copy(direction).negate();
    const skinHit = skin.raycastFirst(ray, DoubleSide)?.distance ?? Infinity;
    // A raised arm or fold can conceal the sampled face. Only require coverage
    // where this point would be visible on the complete skin from this angle.
    if (Math.abs(skinHit - .22) > .0002) continue;
    visibleViews++;
    if (!corsets.some(surface => (surface.raycastFirst(ray, DoubleSide)?.distance ?? Infinity) < skinHit - .0002)) {
      assert.fail(`${label} leaves skin exposed from shoulder view ${direction.toArray().map(value => value.toFixed(2)).join(',')}`);
    }
  }
  return visibleViews;
}

function tuckSamples(bindBody, triangle, center) {
  const regions = { skirt: [], hem: [], corset: [] };
  const points = bindBody.getAttribute('position').array;
  const indices = bindBody.index.array;
  for (let i = 0; i < indices.length; i += 3) {
    const face = indices.subarray(i, i + 3);
    triangle(points, face);
    if (Math.abs(center.x) > .155 || center.y <= 1.052 || center.y >= 1.19) continue;
    regions[center.y < 1.085 ? 'skirt' : center.y < 1.114 ? 'hem' : 'corset'].push(face);
  }
  return regions;
}

function verifyTuckPose(label, samples, points, triangle, center, normal, ray, skirts, corsets) {
  const firstHit = (surfaces) => Math.min(...surfaces.map(surface => surface.raycastFirst(ray, DoubleSide)?.distance ?? Infinity));
  for (const [zone, faces] of Object.entries(samples)) {
    assert(faces.length > 0, `${label} samples the tucked ${zone}`);
    for (const face of faces) {
      triangle(points, face);
      if (Math.abs(normal.y) > .90) continue;
      ray.origin.copy(center).addScaledVector(normal, .08);
      ray.direction.copy(normal).negate();
      const skirt = firstHit(skirts), corset = firstHit(corsets);
      assert(Math.min(skirt, corset) < .0794, `${label} ${zone} sits outside the unmasked body`);
      if (zone === 'skirt' || (zone === 'hem' && skirt < .08 && corset < .08)) assert(skirt < corset, `${label} skirt covers the tucked hem`);
      if (zone === 'corset') assert(corset < skirt, `${label} shows the lower corset above the skirt`);
    }
  }
}

export function verifyCorsetCoverage(root, label, style, buildEmoteClips, findGaragePreviewEmote, bindBody, tucked) {
  const body = root.getObjectByName('BODY_WARDROBE');
  const corset = [], skirt = [];
  const verifyTuck = (style === 2 || style === 3) && tucked;
  root.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const piece = mesh.userData.clothingPiece;
    if (piece !== 'corset' && !(verifyTuck && piece === 'skirt')) return;
    for (let part = mesh; part; part = part.parent) if (!part.visible) return;
    (piece === 'corset' ? corset : skirt).push(mesh);
  });
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), center = new Vector3(), normal = new Vector3();
  function triangle(points, [i, j, k]) {
    a.fromArray(points, i * 3); b.fromArray(points, j * 3); c.fromArray(points, k * 3);
    center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    normal.crossVectors(b.sub(a), c.sub(a)).normalize();
  }
  root.updateMatrixWorld(true);
  const idle = posedVertices(body), indices = visibleIndices(body);
  const required = style === 5 ? ['bust', 'bustTips', 'back', 'shoulders', 'outerShoulders', 'rearStraps', ...highCollarShoulderZones]
    : style === 4 ? ['bust'] : style === 3 ? [] : style === 2 ? ['chest', 'rightCup'] : ['chest', 'leftRearStrap'];
  const unmaskedZones = ['bust', 'bustTips', 'outerShoulders', ...highCollarShoulderZones];
  const samples = Object.fromEntries(required.map(zone => [zone, []]));
  const edges = style === 2 && !tucked ? Object.entries(sweetheartEdges).map(([zone, { select, view }]) => ({ zone, select, view, faces: [] })) : [];
  const bindPoints = bindBody.getAttribute('position').array;
  for (let i = 0; i < indices.length; i += 3) {
    const face = indices.subarray(i, i + 3);
    triangle(idle, face);
    for (const [zone, faces] of Object.entries(samples)) if (!unmaskedZones.includes(zone) && zones[zone](center, normal)) faces.push(face);
    if (edges.length) {
      triangle(bindPoints, face);
      for (const { select, faces } of edges) if (select(center, normal)) faces.push(face);
    }
  }
  const raw = unmaskedZones.filter(zone => samples[zone]);
  if (raw.length) {
    // Check the cloth against the original body even where the outfit masks skin.
    const points = bindBody.getAttribute('position').array;
    const indices = bindBody.index.array;
    for (let i = 0; i < indices.length; i += 3) {
      const face = indices.subarray(i, i + 3);
      triangle(points, face);
      for (const zone of raw) if (zones[zone](center, normal)) samples[zone].push(face);
    }
  }
  for (const [zone, faces] of Object.entries(samples)) assert(faces.length > 0, `${label} samples ${zone}`);
  for (const { zone, faces } of edges) assert(faces.length > 0, `${label} samples Sweetheart ${zone}`);
  const cupFabric = edges.length && corset.find(mesh => mesh.name === 'CLOTH_CORSET_02_LONG_GEO_2');
  if (edges.length) assert(cupFabric, `${label} has visible Sweetheart cup fabric`);
  const tuck = verifyTuck && tuckSamples(bindBody, triangle, center);

  const mixer = new AnimationMixer(root), ray = new Ray(), direction = new Vector3();
  const poses = [['idle', 0], ['013', .45], ['008', .5], ['010', .5]];
  if (style !== 1) poses.push(['009', .5]);
  if (style === 5) poses.push(['heart-overhead', .28], ['heart-overhead', .5], ['heart-overhead', .72]);
  for (const [pose, phase] of poses) {
    const emote = pose === 'idle' ? undefined : findGaragePreviewEmote(pose, false);
    if (pose !== 'idle') assert(emote, `${pose} is available for coverage verification`);
    const clip = emote && buildEmoteClips(root, [emote])[0];
    if (emote) assert(clip, `${pose} builds a clip for the loaded rig`);
    const action = clip && mixer.clipAction(clip).play();
    if (clip) mixer.setTime(clip.duration * phase);
    root.updateMatrixWorld(true);
    const points = posedVertices(body);
    const shapes = corset.map(posedSurface);
    const highCollarSkin = style === 5 ? surfaceFromVertices(points, bindBody.index.array) : undefined;
    const raisedSkin = pose === 'heart-overhead' ? highCollarSkin : undefined;
    if (cupFabric) {
      const surface = shapes[corset.indexOf(cupFabric)];
      for (const { zone, view, faces } of edges) for (const face of faces) {
        triangle(points, face);
        ray.origin.copy(center).addScaledVector(view, .1);
        ray.direction.copy(view).negate();
        assert((surface.raycastFirst(ray, DoubleSide)?.distance ?? Infinity) < .099, `${label} ${pose} leaves Sweetheart ${zone} exposed`);
      }
    }
    for (const [zone, faces] of Object.entries(samples)) {
      if (highCollarSkin && highCollarShoulderZones.includes(zone)) {
        const visibleViews = { left: 0, right: 0 };
        for (const face of faces) {
          triangle(bindPoints, face);
          const side = Math.sign(center.x);
          const name = side < 0 ? 'left' : 'right';
          triangle(points, face);
          visibleViews[name] += verifyShoulderViews(`${label} ${pose}@${phase} ${zone} (${name})`,
            ray, center, normal, side, direction, highCollarSkin, shapes);
        }
        assert(visibleViews.left > 0 && visibleViews.right > 0, `${label} ${pose}@${phase} samples both sides of ${zone}`);
        continue;
      }
      if (raisedSkin && zone !== 'bustTips' && zone !== 'outerShoulders') continue;
      let covered = 0;
      for (const face of faces) {
        triangle(points, face);
        if (raisedSkin && zone === 'outerShoulders') {
          verifyRaisedShoulder(`${label} ${pose}`, ray, center, direction, raisedSkin, shapes);
          continue;
        }
        ray.origin.copy(center).addScaledVector(normal, .1);
        ray.direction.copy(normal).negate();
        const distance = Math.min(...shapes.map(surface => surface.raycastFirst(ray, DoubleSide)?.distance ?? Infinity));
        // At the dipped neckline some shoulder poses cast over the edge, through to the back.
        if (zone === 'rightCup' && distance > .145) continue;
        assert(distance < (zone === 'bustTips' ? .0975 : .100001), `${label} ${pose} leaves ${zone} exposed`);
        covered++;
      }
      if (zone === 'rightCup') assert(covered >= faces.length / 2, `${label} ${pose} reaches the right cup`);
    }
    if (tuck) verifyTuckPose(`${label} ${pose}`, tuck, points, triangle, center, normal, ray, skirt.map(posedSurface), shapes);
    action?.stop();
    if (clip) mixer.uncacheClip(clip);
  }
}
