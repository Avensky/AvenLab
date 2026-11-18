import { MathUtils, Vector3, type BufferAttribute, type BufferGeometry } from "three";

import { sameWardrobeFitInputs, wardrobeFitInputs } from "./wardrobeSurface";

const fitted = new WeakMap<BufferGeometry, {
  inputs: ReturnType<typeof wardrobeFitInputs>;
  joints: BufferAttribute;
  weights: BufferAttribute;
  normals: BufferAttribute;
}>();

/** Ease the transition between ribcage and upper arm without moving the resting skin. */
export function smoothUnderarmSkin(body: BufferGeometry, donor: BufferGeometry) {
  const position = body.getAttribute("position"), weights = body.getAttribute("skinWeight");
  const joints = body.getAttribute("skinIndex"), faces = body.getIndex();
  const normals = body.getAttribute("normal");
  if (!faces || !weights || !joints || !normals) return;
  const inputs = wardrobeFitInputs(donor);
  const cached = fitted.get(donor);
  if (cached && sameWardrobeFitInputs(inputs, cached.inputs)) {
    body.setAttribute("skinIndex", cached.joints.clone());
    body.setAttribute("skinWeight", cached.weights.clone());
    body.setAttribute("normal", cached.normals.clone());
    return;
  }
  const nodes = new Map<string, number>();
  const vertexNode = new Int32Array(position.count).fill(-1);
  const neighbors: Set<number>[] = [], strength: number[] = [];
  let influences: Map<number, number>[] = [];
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    if (Math.abs(x) < .078 || Math.abs(x) > .225 || y < 1.18 || y > 1.415) continue;
    // UV islands can split a vertex. Give coincident points the same neighborhood.
    const key = [x, y, z].map(n => Math.round(n * 1e5)).join(",");
    let node = nodes.get(key);
    if (node === undefined) {
      node = neighbors.length;
      nodes.set(key, node);
      neighbors.push(new Set());
      strength.push(MathUtils.smoothstep(Math.abs(x), .078, .103) * (1 - MathUtils.smoothstep(Math.abs(x), .19, .225))
        * MathUtils.smoothstep(y, 1.18, 1.23) * (1 - MathUtils.smoothstep(y, 1.36, 1.415)));
      const blend = new Map<number, number>();
      for (let k = 0; k < 4; k++) {
        const w = weights.getComponent(i, k);
        if (w) blend.set(joints.getComponent(i, k), w);
      }
      influences.push(blend);
    }
    vertexNode[i] = node;
  }
  for (let i = 0; i < faces.count; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = vertexNode[faces.getX(i + k)], b = vertexNode[faces.getX(i + (k + 1) % 3)];
      if (a >= 0 && b >= 0 && a !== b) { neighbors[a].add(b); neighbors[b].add(a); }
    }
  }
  for (let pass = 0; pass < 12; pass++) {
    influences = influences.map((old, i) => {
      if (!neighbors[i].size) return old;
      const alpha = .75 * strength[i], next = new Map<number, number>();
      for (const [joint, w] of old) next.set(joint, w * (1 - alpha));
      for (const neighbor of neighbors[i]) for (const [joint, w] of influences[neighbor]) {
        next.set(joint, (next.get(joint) ?? 0) + w * alpha / neighbors[i].size);
      }
      return next;
    });
  }
  // Average directions across welded UV seams, fading back to authored skin normals.
  const normal = new Vector3();
  let directions = neighbors.map(() => new Vector3());
  for (let i = 0; i < vertexNode.length; i++) {
    const node = vertexNode[i];
    if (node >= 0) directions[node].add(normal.fromBufferAttribute(normals, i));
  }
  directions.forEach(direction => direction.normalize());
  for (let pass = 0; pass < 10; pass++) {
    directions = directions.map((direction, node) => {
      if (!neighbors[node].size) return direction;
      const average = new Vector3();
      for (const neighbor of neighbors[node]) average.add(directions[neighbor]);
      return direction.clone().lerp(average.normalize(), .65 * strength[node]).normalize();
    });
  }
  const ranked = influences.map(blend => [...blend].sort((a, b) => b[1] - a[1]).slice(0, 4));
  for (let i = 0; i < position.count; i++) {
    const node = vertexNode[i];
    if (node < 0 || !strength[node]) continue;
    normal.fromBufferAttribute(normals, i).lerp(directions[node], strength[node]).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
    const blend = ranked[node], sum = blend.reduce((n, entry) => n + entry[1], 0);
    if (!sum) continue;
    for (let k = 0; k < 4; k++) {
      joints.setComponent(i, k, blend[k]?.[0] ?? 0);
      weights.setComponent(i, k, (blend[k]?.[1] ?? 0) / sum);
    }
  }
  fitted.set(donor, { inputs, joints: joints.clone(), weights: weights.clone(), normals: normals.clone() });
}
