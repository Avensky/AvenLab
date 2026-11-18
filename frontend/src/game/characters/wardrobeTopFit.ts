import { BufferGeometry, MathUtils, Triangle, Vector3, type BufferAttribute, type Skeleton } from "three";
import { MeshBVH, type HitPointInfo } from "three-mesh-bvh";
import { fitWardrobeSurface, sameWardrobeFitInputs, wardrobeFitInputs } from "./wardrobeSurface.ts";

// Preserve the original torso blend at the bottom of the sleeveless tops' armholes. The
// upper rim still follows the shoulders and the collar keeps its own rigging.
function anchorLowerArmholes(source: BufferGeometry, armJoints: boolean[], wideRim: boolean) {
  const positions = source.getAttribute("position"), joints = source.getAttribute("skinIndex"), weights = source.getAttribute("skinWeight");
  if (!positions || !joints || !weights) return;
  let fitted: BufferGeometry | undefined;
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const y = positions.getY(vertex);
    const anchor = MathUtils.smoothstep(Math.abs(positions.getX(vertex)), wideRim ? .085 : .112, wideRim ? .125 : .123)
      * MathUtils.smoothstep(y, 1.21, 1.25) * (1 - MathUtils.smoothstep(y, wideRim ? 1.255 : 1.325, wideRim ? 1.378 : 1.38));
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

// Both sides use the same bind-space cut traced from the raised-arm review.
function top02ArmholeEdge(point: Vector3) {
  const shoulder = MathUtils.smoothstep(point.y, 1.28, 1.39);
  const lowerRim = 1 - MathUtils.smoothstep(point.y, 1.24, 1.279);
  const front = MathUtils.smoothstep(point.z, .015, .095);
  return .122 - .022 * shoulder + .095 * lowerRim + .018 * front - Math.abs(point.x);
}

// A pleat in the imported rear panel doubles back across itself. Relax its
// vertex heights along the cloth topology while pinning the rows around it.
function smoothTop05Back(geometry: BufferGeometry) {
  const pos = geometry.getAttribute("position"), index = geometry.getIndex();
  if (!index) return;
  const rows = new Map<number, Set<number>>();
  for (let i = 0; i < index.count; i += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const v = index.getX(i + corner), y = pos.getY(v);
      if (pos.getZ(v) >= 0 || y <= 1.146 || y >= 1.18) continue;
      let neighbors = rows.get(v);
      if (!neighbors) rows.set(v, neighbors = new Set());
      neighbors.add(index.getX(i + (corner + 1) % 3));
      neighbors.add(index.getX(i + (corner + 2) % 3));
    }
  }
  const heights = new Map<number, number>();
  for (let pass = 0; pass < 20; pass++) {
    for (const [v, neighbors] of rows) {
      let sum = 0;
      for (const other of neighbors) sum += pos.getY(other);
      heights.set(v, (pos.getY(v) + sum / neighbors.size) * .5);
    }
    for (const [v, y] of heights) pos.setY(v, y);
  }
  const original = geometry.getAttribute("normal");
  geometry.deleteAttribute("normal");
  geometry.computeVertexNormals();
  const smooth = geometry.getAttribute("normal");
  for (const v of rows.keys()) original.setXYZ(v, smooth.getX(v), smooth.getY(v), smooth.getZ(v));
  geometry.setAttribute("normal", original);
}

/** Ease only the Pack 7 cloth vertices that lie against the skin. */
function buildWardrobeTopFit(body: BufferGeometry, id: string, skeleton?: Skeleton) {
  const position = body.getAttribute("position"), normal = body.getAttribute("normal"), index = body.getIndex()!;

  const contact = .010;
  const shoulderFit = id === "top-02" || id === "top-03";
  const armJoints = shoulderFit
    ? skeleton?.bones.map(bone => id === "top-02" ? bone.name.startsWith("upperarm") : /^(clavicle|upperarm)(_|$)/.test(bone.name))
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
    let fitted = armJoints && anchorLowerArmholes(source, armJoints, id === "top-02");
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
    if (id === "top-02") {
      const cut = fitWardrobeSurface(fitted ?? source, [top02ArmholeEdge], 0, true);
      if (cut) {
        if (source.hasAttribute("tangent") && cut.hasAttribute("uv")) cut.computeTangents();
        fitted?.dispose();
        fitted = cut;
      }
    }
    if (id === "top-05") smoothTop05Back(fitted ??= source.clone());
    if (fitted) {
      fitted.computeBoundingBox();
      fitted.computeBoundingSphere();
    }
    return fitted;
  };
}

type FitInputs = ReturnType<typeof wardrobeFitInputs>;
type SavedTopFit = { inputs: FitInputs; cut?: BufferGeometry; position?: BufferAttribute; skinWeight?: BufferAttribute; normal?: BufferAttribute };
type DonorFit = {
  inputs: FitInputs; jointNames: string; parts: WeakMap<BufferGeometry, SavedTopFit>;
};
const top02ByBody = new WeakMap<BufferGeometry, DonorFit>();
const top03ByBody = new WeakMap<BufferGeometry, DonorFit>();
const top05ByBody = new WeakMap<BufferGeometry, DonorFit>();

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
  const cache = id === "top-02" ? top02ByBody : id === "top-03" ? top03ByBody : id === "top-05" ? top05ByBody : undefined;
  if (!cache) return buildWardrobeTopFit(body, id, skeleton);

  const inputs = wardrobeFitInputs(body);
  const jointNames = JSON.stringify(skeleton?.bones.map(bone => bone.name) ?? []);
  let donor = cache.get(body);
  if (!donor || donor.jointNames !== jointNames || !sameWardrobeFitInputs(donor.inputs, inputs)) {
    donor = { inputs, jointNames, parts: new WeakMap() };
    cache.set(body, donor);
  }
  const { parts } = donor;
  let fit: ReturnType<typeof buildWardrobeTopFit> | undefined;
  return (source: BufferGeometry) => {
    const inputs = wardrobeFitInputs(source, id === "top-02" ? ["uv", "tangent", "_aven_coverage"] : []);
    const saved = parts.get(source);
    if (saved && sameWardrobeFitInputs(saved.inputs, inputs)) {
      if (saved.cut) return saved.cut.clone();
      if (!saved.position) return;
      // Each actor owns the geometry it uploads and disposes. Keep the unfitted
      // attributes from the current source, including any revised UVs or morphs.
      const owned = source.clone();
      restoreAttribute(owned, "position", saved.position);
      if (saved.skinWeight) restoreAttribute(owned, "skinWeight", saved.skinWeight);
      if (saved.normal) restoreAttribute(owned, "normal", saved.normal);
      owned.computeBoundingBox();
      owned.computeBoundingSphere();
      return owned;
    }
    fit ??= buildWardrobeTopFit(body, id, skeleton);
    const fitted = fit(source);
    if (id === "top-02" && fitted) {
      parts.set(source, { inputs, cut: fitted });
      return fitted.clone();
    }
    parts.set(source, { inputs, position: fitted?.getAttribute("position").clone(),
      normal: id === "top-05" ? fitted?.getAttribute("normal").clone() : undefined,
      skinWeight: id === "top-03" ? fitted?.getAttribute("skinWeight")?.clone() : undefined });
    return fitted;
  };
}
