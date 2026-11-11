import assert from 'node:assert/strict';
import { AnimationMixer, BufferGeometry, DoubleSide, Float32BufferAttribute, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// Sample the protected front and upper back on the exact loaded body. Track
// those same triangles through poses so arms in front do not hide fit defects.
const zones = {
  chest: (p, n) => p.z > .083 && Math.abs(p.x) > .037 && Math.abs(p.x) < .09 && p.y > 1.252 && p.y < 1.292 && n.z > .35,
  rightCup: (p, n) => p.x > -.092 && p.x < -.055 && p.y > 1.299 && p.y < 1.312 && p.z > .072 && n.z > .18,
  bust: (p, n) => p.z > .081 && Math.abs(p.x) > .035 && Math.abs(p.x) < .096 && p.y > 1.244 && p.y < 1.296 && n.z > .32,
  back: (p, n) => p.z < -.025 && Math.abs(p.x) < .105 && p.y > 1.33 && p.y < 1.405 && n.z < -.35,
  shoulders: (p, n) => Math.abs(p.x) > .08 && Math.abs(p.x) < .139 && p.y > 1.36 && p.y < 1.414 && n.y > .2,
  rearStraps: (p, n) => p.z < -.04 && Math.abs(p.x) > .095 && Math.abs(p.x) < .132 && p.y > 1.345 && p.y < 1.398 && n.z < -.3,
  leftRearStrap: (p, n) => p.x > .099 && p.x < .117 && p.y > 1.352 && p.y < 1.382 && p.z < -.068 && n.z < -.35,
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

function posedSurface(mesh) {
  return new MeshBVH(new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute(posedVertices(mesh), 3))
    .setIndex(Array.from(visibleIndices(mesh))));
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
  const required = style === 5 ? ['bust', 'back', 'shoulders', 'rearStraps']
    : style === 4 ? ['bust'] : style === 3 ? [] : style === 2 ? ['chest', 'rightCup'] : ['chest', 'leftRearStrap'];
  const samples = Object.fromEntries(required.map(zone => [zone, []]));
  for (let i = 0; i < indices.length; i += 3) {
    const face = indices.subarray(i, i + 3);
    triangle(idle, face);
    for (const [zone, faces] of Object.entries(samples)) if (zone !== 'bust' && zones[zone](center, normal)) faces.push(face);
  }
  if (samples.bust) {
    // Check the cloth against the original chest even where the outfit masks skin.
    const points = bindBody.getAttribute('position').array;
    const indices = bindBody.index.array;
    for (let i = 0; i < indices.length; i += 3) {
      const face = indices.subarray(i, i + 3);
      triangle(points, face);
      if (zones.bust(center, normal)) samples.bust.push(face);
    }
  }
  for (const [zone, faces] of Object.entries(samples)) assert(faces.length > 0, `${label} samples ${zone}`);
  const tuck = verifyTuck && tuckSamples(bindBody, triangle, center);

  const mixer = new AnimationMixer(root), ray = new Ray();
  const poses = [['idle', 0], ['013', .45], ['008', .5], ['010', .5]];
  if (style !== 1) poses.push(['009', .5]);
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
    for (const [zone, faces] of Object.entries(samples)) {
      let covered = 0;
      for (const face of faces) {
        triangle(points, face);
        ray.origin.copy(center).addScaledVector(normal, .1);
        ray.direction.copy(normal).negate();
        const distance = Math.min(...shapes.map(surface => surface.raycastFirst(ray, DoubleSide)?.distance ?? Infinity));
        // At the dipped neckline some shoulder poses cast over the edge, through to the back.
        if (zone === 'rightCup' && distance > .145) continue;
        assert(distance < .100001, `${label} ${pose} leaves ${zone} exposed`);
        covered++;
      }
      if (zone === 'rightCup') assert(covered >= faces.length / 2, `${label} ${pose} reaches the right cup`);
    }
    if (tuck) verifyTuckPose(`${label} ${pose}`, tuck, points, triangle, center, normal, ray, skirt.map(posedSurface), shapes);
    action?.stop();
    if (clip) mixer.uncacheClip(clip);
  }
}
