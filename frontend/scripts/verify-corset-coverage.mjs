import assert from 'node:assert/strict';
import { AnimationMixer, BufferGeometry, DoubleSide, Float32BufferAttribute, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// Sample the protected front and upper back on the exact loaded body. Track
// those same triangles through poses so arms in front do not hide fit defects.
const zones = {
  chest: (p, n) => p.z > .083 && Math.abs(p.x) > .037 && Math.abs(p.x) < .09 && p.y > 1.252 && p.y < 1.292 && n.z > .35,
  back: (p, n) => p.z < -.025 && Math.abs(p.x) < .105 && p.y > 1.33 && p.y < 1.405 && n.z < -.35,
  shoulders: (p, n) => Math.abs(p.x) > .08 && Math.abs(p.x) < .139 && p.y > 1.36 && p.y < 1.414 && n.y > .2,
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

export function verifyCorsetCoverage(root, label, style, buildEmoteClips, findGaragePreviewEmote) {
  const body = root.getObjectByName('BODY_WARDROBE');
  const corset = [];
  root.traverse(mesh => {
    if (!mesh.isSkinnedMesh || mesh.userData.clothingPiece !== 'corset') return;
    for (let part = mesh; part; part = part.parent) if (!part.visible) return;
    corset.push(mesh);
  });
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), center = new Vector3(), normal = new Vector3();
  function triangle(points, [i, j, k]) {
    a.fromArray(points, i * 3); b.fromArray(points, j * 3); c.fromArray(points, k * 3);
    center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    normal.crossVectors(b.sub(a), c.sub(a)).normalize();
  }
  root.updateMatrixWorld(true);
  const idle = posedVertices(body), indices = visibleIndices(body);
  const required = style === 5 ? ['chest', 'back', 'shoulders'] : style === 1 ? ['chest', 'leftRearStrap'] : ['chest'];
  const samples = Object.fromEntries(required.map(zone => [zone, []]));
  for (let i = 0; i < indices.length; i += 3) {
    const face = indices.subarray(i, i + 3);
    triangle(idle, face);
    for (const [zone, faces] of Object.entries(samples)) if (zones[zone](center, normal)) faces.push(face);
  }
  for (const [zone, faces] of Object.entries(samples)) assert(faces.length > 0, `${label} samples ${zone}`);

  const mixer = new AnimationMixer(root), ray = new Ray();
  for (const [pose, phase] of [['idle', 0], ['013', .45], ['008', .5], ['010', .5]]) {
    const emote = pose === 'idle' ? undefined : findGaragePreviewEmote(pose, false);
    if (pose !== 'idle') assert(emote, `${pose} is available for coverage verification`);
    const clip = emote && buildEmoteClips(root, [emote])[0];
    if (emote) assert(clip, `${pose} builds a clip for the loaded rig`);
    const action = clip && mixer.clipAction(clip).play();
    if (clip) mixer.setTime(clip.duration * phase);
    root.updateMatrixWorld(true);
    const points = posedVertices(body);
    const shapes = corset.map(mesh => new MeshBVH(new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute(posedVertices(mesh), 3))
      .setIndex(Array.from(visibleIndices(mesh)))));
    for (const [zone, faces] of Object.entries(samples)) {
      for (const face of faces) {
        triangle(points, face);
        ray.origin.copy(center).addScaledVector(normal, .1);
        ray.direction.copy(normal).negate();
        assert(shapes.some(surface => (surface.raycastFirst(ray, DoubleSide)?.distance ?? Infinity) < .100001), `${label} ${pose} leaves ${zone} exposed`);
      }
    }
    action?.stop();
    if (clip) mixer.uncacheClip(clip);
  }
}
