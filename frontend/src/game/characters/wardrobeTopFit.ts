import { BufferGeometry, MathUtils, Triangle, Vector3, type BufferAttribute, type Skeleton } from "three";
import { MeshBVH, type HitPointInfo } from "three-mesh-bvh";
import { sameWardrobeFitInputs, wardrobeFitInputs } from "./wardrobeSurface.ts";

// Preserve the original torso blend at the bottom of Top 03's armholes. The
// upper rim still follows the shoulders and the collar keeps its own rigging.
function anchorTop03Armholes(source: BufferGeometry, armJoints: boolean[]) {
  const positions = source.getAttribute("position"), joints = source.getAttribute("skinIndex"), weights = source.getAttribute("skinWeight");
  if (!positions || !joints || !weights) return;
  let fitted: BufferGeometry | undefined;
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const y = positions.getY(vertex);
    const anchor = MathUtils.smoothstep(Math.abs(positions.getX(vertex)), .112, .123)
      * MathUtils.smoothstep(y, 1.21, 1.25) * (1 - MathUtils.smoothstep(y, 1.325, 1.38));
    if (!anchor) continue;

    let arm = 0, torso = 0;
    for (let channel = 0; channel < 4; channel++) {
      const weight = weights.getComponent(vertex, channel);
      if (armJoints[joints.getComponent(vertex, channel)]) arm += weight;
      else torso += weight;
    }
    if (!arm || !torso) continue;

    fitted ??= source.clone();
    const target = fitted.getAttribute("skinWeight");
    for (let channel = 0; channel < 4; channel++) {
      const armBone = armJoints[joints.getComponent(vertex, channel)];
      const scale = armBone ? 1 - anchor : 1 + anchor * arm / torso;
      target.setComponent(vertex, channel, weights.getComponent(vertex, channel) * scale);
    }
  }
  return fitted;
}

/** Ease only the Pack 7 cloth vertices that lie against the skin. */
function buildWardrobeTopFit(body: BufferGeometry, id: string, skeleton?: Skeleton) {
  const position = body.getAttribute("position"), normal = body.getAttribute("normal"), index = body.getIndex()!;

  const contact = .010;
  const shoulderFit = id === "top-02" || id === "top-03";
  const armJoints = id === "top-03"
    ? skeleton?.bones.map(bone => /^(clavicle|upperarm)(_|$)/.test(bone.name))
    : undefined;
  const surfaceGeometry = new BufferGeometry().setAttribute("position", position).setIndex(index.clone());
  const surface = new MeshBVH(surfaceGeometry);
  const triangles = surfaceGeometry.getIndex()!;
  const hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const point = new Vector3(), triangle = new Triangle(), bary = new Vector3();
  const direction = new Vector3(), scratch = new Vector3();

  return (source: BufferGeometry) => {
    const cloth = source.getAttribute("position");
    if (!cloth) return;
    let fitted = armJoints && anchorTop03Armholes(source, armJoints);
    for (let vertex = 0; vertex < cloth.count; vertex++) {
      point.fromBufferAttribute(cloth, vertex);
      if (!surface.closestPointToPoint(point, hit, 0, contact) || hit.distance >= contact) continue;
      const a = triangles.getX(hit.faceIndex * 3), b = triangles.getX(hit.faceIndex * 3 + 1), c = triangles.getX(hit.faceIndex * 3 + 2);
      triangle.setFromAttributeAndIndices(position, a, b, c);
      if (!triangle.getBarycoord(hit.point, bary)) continue;
      direction.set(0, 0, 0).addScaledVector(scratch.fromBufferAttribute(normal, a), bary.x)
        .addScaledVector(scratch.fromBufferAttribute(normal, b), bary.y)
        .addScaledVector(scratch.fromBufferAttribute(normal, c), bary.z).normalize();
      const gap = scratch.copy(point).sub(hit.point).dot(direction);
      const across = Math.abs(point.x);
      // These two armholes cross the shoulder crease when the arm lifts.
      const shoulder = shoulderFit ? MathUtils.smoothstep(across, .095, .111) * (1 - MathUtils.smoothstep(across, .137, .157))
        * MathUtils.smoothstep(point.y, 1.344, 1.375) * (1 - MathUtils.smoothstep(point.y, 1.411, 1.440)) : 0;
      const ease = MathUtils.clamp(.002 - .0013 * shoulder - gap, -.004 * shoulder, .004);
      if (!ease) continue;

      fitted ??= source.clone();
      point.addScaledVector(direction, ease);
      fitted.getAttribute("position").setXYZ(vertex, point.x, point.y, point.z);
    }
    if (fitted) {
      fitted.computeBoundingBox();
      fitted.computeBoundingSphere();
    }
    return fitted;
  };
}

type FitInputs = ReturnType<typeof wardrobeFitInputs>;
type SavedTopFit = { inputs: FitInputs; position?: BufferAttribute; skinWeight?: BufferAttribute };
const top03ByBody = new WeakMap<BufferGeometry, {
  inputs: FitInputs; jointNames: string; parts: WeakMap<BufferGeometry, SavedTopFit>;
}>();

function restoreAttribute(geometry: BufferGeometry, name: string, saved: BufferAttribute) {
  const target = geometry.getAttribute(name);
  if ("data" in target) {
    // Raw elements preserve normalized weights and leave adjacent UVs in place.
    for (let i = 0; i < target.count; i++) {
      const offset = i * target.data.stride + target.offset;
      for (let c = 0; c < target.itemSize; c++) target.data.array[offset + c] = saved.array[i * target.itemSize + c];
    }
  } else {
    target.array.set(saved.array);
  }
}

export function prepareWardrobeTopFit(body: BufferGeometry, id: string, skeleton?: Skeleton) {
  if (!body.hasAttribute("position") || !body.hasAttribute("normal") || !body.getIndex()) return;
  if (id !== "top-03") return buildWardrobeTopFit(body, id, skeleton);

  const inputs = wardrobeFitInputs(body);
  const jointNames = JSON.stringify(skeleton?.bones.map(bone => bone.name) ?? []);
  let donor = top03ByBody.get(body);
  if (!donor || donor.jointNames !== jointNames || !sameWardrobeFitInputs(donor.inputs, inputs)) {
    donor = { inputs, jointNames, parts: new WeakMap() };
    top03ByBody.set(body, donor);
  }
  const { parts } = donor;
  let fit: ReturnType<typeof buildWardrobeTopFit> | undefined;
  return (source: BufferGeometry) => {
    const inputs = wardrobeFitInputs(source);
    const saved = parts.get(source);
    if (saved && sameWardrobeFitInputs(saved.inputs, inputs)) {
      if (!saved.position) return;
      // Each actor owns the geometry it uploads and disposes. Keep the unfitted
      // attributes from the current source, including any revised UVs or morphs.
      const owned = source.clone();
      restoreAttribute(owned, "position", saved.position);
      if (saved.skinWeight) restoreAttribute(owned, "skinWeight", saved.skinWeight);
      owned.computeBoundingBox();
      owned.computeBoundingSphere();
      return owned;
    }
    fit ??= buildWardrobeTopFit(body, id, skeleton);
    const fitted = fit(source);
    parts.set(source, { inputs, position: fitted?.getAttribute("position").clone(),
      skinWeight: fitted?.getAttribute("skinWeight")?.clone() });
    return fitted;
  };
}
