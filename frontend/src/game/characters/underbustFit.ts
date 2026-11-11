import { BufferAttribute, MathUtils, Matrix3, SkinnedMesh, Triangle, Vector3, type BufferGeometry, type Object3D } from "three";
import { MeshBVH, type HitPointInfo } from "three-mesh-bvh";
import { fitWardrobeSurface } from "./wardrobeSurface.ts";

export const UNDERBUST_FIT_VERSION = 1;
const TORSO_DEPTH = .018;

function vestProfile(x: number, y: number, z: number, tucked: boolean) {
  const hem = tucked ? MathUtils.lerp(.72, 1, MathUtils.smoothstep(y, 1.097, 1.162))
    : MathUtils.lerp(.65, 1, MathUtils.smoothstep(y, 1.027, 1.146));
  const shoulder = MathUtils.smoothstep(y, 1.309, 1.384);
  const cupEdge = MathUtils.smoothstep(y, 1.155, 1.200) * (1 - MathUtils.smoothstep(y, 1.262, 1.297))
    * MathUtils.smoothstep(z, .059, .109) * (1 - MathUtils.smoothstep(Math.abs(x), .080, .112));
  const armhole = MathUtils.smoothstep(y, 1.222, 1.264) * (1 - MathUtils.smoothstep(y, 1.278, 1.316))
    * MathUtils.smoothstep(Math.abs(x), .103, .135);
  // Narrow the shoulder in a smooth, monotonic sweep. Moving isolated
  // vertices by their closest body normal can fold the sewn trim over itself.
  const across = Math.abs(x), side = Math.sign(x);
  const crest = MathUtils.smoothstep(y, 1.338, 1.383);
  const shoulderSide = MathUtils.smoothstep(across, .068, .105);
  const upper = MathUtils.smoothstep(y, 1.301, 1.369) * shoulderSide;
  const front = MathUtils.smoothstep(z, -.008, .048);
  const rear = 1 - MathUtils.smoothstep(z, -.057, -.006);
  const strapWidth = Math.max(0, across - .081) * .56 * crest;
  const strapLift = crest * shoulderSide * (.004 + .205 * Math.max(0, across - .082));
  return {
    x: x * (1 + .113 * hem * (1 - shoulder)) + side * (.006 * armhole - strapWidth),
    y: y + strapLift,
    z: TORSO_DEPTH + (z - TORSO_DEPTH) * (1 + .131 * hem * (1 - shoulder))
      + .018 * cupEdge - .003 * armhole * (1 - MathUtils.smoothstep(z, -.073, -.030))
      + upper * (.016 * front - .010 * rear),
  };
}

function fitShoulders(body: BufferGeometry) {
  const index = body.getIndex(), position = body.getAttribute("position");
  const skinIndex = body.getAttribute("skinIndex"), skinWeight = body.getAttribute("skinWeight");
  if (!index || !position || !skinIndex || !skinWeight) return;
  // Keep the shared body index intact while searching bind-pose triangles.
  const options = { indirect: true, setBoundingBox: false };
  const surface = new MeshBVH(body, options);
  const hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const triangle = new Triangle(), barycentric = new Vector3(), across = new Vector3();
  return (geometry: BufferGeometry, vertex: number, authored: Vector3, fitted: Vector3) => {
    const shoulder = MathUtils.smoothstep(authored.y, 1.294, 1.351) * MathUtils.smoothstep(Math.abs(authored.x), .047, .102);
    if (!shoulder) return;
    // Follow the joints beneath the revised strap, while keeping the
    // garment's own torso and waist weights intact.
    across.set(fitted.x, authored.y, authored.z);
    if (!surface.closestPointToPoint(across, hit, 0, .048)) return;

    const a = index.getX(hit.faceIndex * 3), b = index.getX(hit.faceIndex * 3 + 1), c = index.getX(hit.faceIndex * 3 + 2);
    triangle.setFromAttributeAndIndices(position, a, b, c);
    if (!triangle.getBarycoord(hit.point, barycentric)) return;

    const joints = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
    const influences = new Map<number, number>();
    const add = (joint: number, weight: number) => influences.set(joint, (influences.get(joint) ?? 0) + weight);
    for (let channel = 0; channel < 4; channel++) {
      add(joints.getComponent(vertex, channel), (1 - shoulder) * weights.getComponent(vertex, channel));
      add(skinIndex.getComponent(a, channel), shoulder * barycentric.x * skinWeight.getComponent(a, channel));
      add(skinIndex.getComponent(b, channel), shoulder * barycentric.y * skinWeight.getComponent(b, channel));
      add(skinIndex.getComponent(c, channel), shoulder * barycentric.z * skinWeight.getComponent(c, channel));
    }
    const strongest = [...influences].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
    const sum = strongest.reduce((total, [, weight]) => total + weight, 0);
    for (let channel = 0; channel < 4; channel++) {
      joints.setComponent(vertex, channel, strongest[channel]?.[0] ?? 0);
      weights.setComponent(vertex, channel, (strongest[channel]?.[1] ?? 0) / sum);
    }
  };
}

function strapCut(z: number) {
  return MathUtils.lerp(1.367, 1.339, MathUtils.smoothstep(z, -.053, .042));
}

function fitStrapCrowns(body: BufferGeometry, trim = false) {
  const edge = (point: Vector3) => {
    const front = MathUtils.smoothstep(point.z, -.036, .052);
    const center = MathUtils.lerp(.102, .115, front);
    const width = .017 + .004 * (1 - MathUtils.smoothstep(point.y, 1.354, 1.383));
    return width - Math.abs(Math.abs(point.x) - center);
  };
  const boundaries = [
    (point: Vector3) => point.y - strapCut(point.z) + .022,
    (point: Vector3) => Math.abs(point.x) - .064,
    edge,
  ];
  if (trim) boundaries.push(point => .0026 * MathUtils.smoothstep(point.y - strapCut(point.z), -.016, .005) - edge(point));
  return fitWardrobeSurface(body, boundaries, point => {
    const crest = MathUtils.smoothstep(point.y, 1.344, 1.392);
    const front = MathUtils.smoothstep(point.z, -.030, .040);
    const join = MathUtils.smoothstep(point.y - strapCut(point.z), -.019, .010);
    return .009 + .004 * join + .003 * crest + .002 * front + (trim ? .0012 : 0);
  });
}

function replaceStrapCrowns(source: BufferGeometry, fitted: BufferGeometry, crowns?: BufferGeometry) {
  const index = source.getIndex();
  if (!index) return;
  const position = source.getAttribute("position");
  const retained: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const y = (position.getY(a) + position.getY(b) + position.getY(c)) / 3;
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
    if (y <= strapCut(z) || Math.abs(x) < .071) retained.push(a, b, c);
  }
  if (crowns) {
    const added = crowns.getAttribute("position"), count = position.count;
    fitted.userData.underbustCrownStart = count;
    const uv = fitted.getAttribute("uv");
    // Inherit the nearest point of the original shoulder's atlas island.
    const surface = uv && new MeshBVH(fitted, { setBoundingBox: false });
    const scratch = new Vector3(), triangle = new Triangle(), weights = new Vector3();
    const hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 };
    const fittedIndex = fitted.getIndex()!, fittedPosition = fitted.getAttribute("position");
    for (const [name, attribute] of Object.entries(fitted.attributes)) {
      if (!(attribute instanceof BufferAttribute)) continue;
      const from = crowns.getAttribute(name);
      const ArrayType = attribute.array.constructor as { new (length: number): typeof attribute.array };
      const joined = new BufferAttribute(new ArrayType((count + added.count) * attribute.itemSize), attribute.itemSize, attribute.normalized);
      joined.array.set(attribute.array);
      for (let i = 0; i < added.count; i++) {
        if (name === "uv" && uv && surface?.closestPointToPoint(scratch.fromBufferAttribute(added, i), hit)) {
          const a = fittedIndex.getX(hit.faceIndex * 3), b = fittedIndex.getX(hit.faceIndex * 3 + 1), c = fittedIndex.getX(hit.faceIndex * 3 + 2);
          triangle.setFromAttributeAndIndices(fittedPosition, a, b, c);
          if (triangle.getBarycoord(hit.point, weights)) joined.setXY(count + i,
            weights.x * uv.getX(a) + weights.y * uv.getX(b) + weights.z * uv.getX(c),
            weights.x * uv.getY(a) + weights.y * uv.getY(b) + weights.z * uv.getY(c));
        } else if (from) {
          for (let channel = 0; channel < attribute.itemSize; channel++) joined.setComponent(count + i, channel, from.getComponent(i, channel));
        }
      }
      fitted.setAttribute(name, joined);
    }
    const addedIndex = crowns.getIndex()!;
    for (let i = 0; i < addedIndex.count; i++) retained.push(count + addedIndex.getX(i));
  }
  fitted.setIndex(retained);
  fitted.setDrawRange(0, retained.length);
}

/** Refit the original shell and straps while preserving its material cuts and UVs. */
export function prepareUnderbustVestFit(body: BufferGeometry) {
  const followShoulders = fitShoulders(body);
  const crowns = fitStrapCrowns(body), crownTrim = fitStrapCrowns(body, true);
  const direction = new Vector3(), authored = new Vector3(), point = new Vector3(), jacobian = new Matrix3();
  const step = .0002;
  return (source: BufferGeometry, tucked: boolean, material: string) => {
    const fitted = source.clone();
    const position = fitted.getAttribute("position"), normal = fitted.getAttribute("normal");
    if (!position) return fitted;
    const follow = fitted.hasAttribute("skinIndex") && fitted.hasAttribute("skinWeight") ? followShoulders : undefined;
    for (let i = 0; i < position.count; i++) {
      authored.fromBufferAttribute(position, i);
      const { x, y, z } = authored;
      const profile = vestProfile(x, y, z, tucked);
      point.set(profile.x, profile.y, profile.z);
      follow?.(fitted, i, authored, point);
      position.setXYZ(i, point.x, point.y, point.z);
      if (!normal) continue;
      // Transform the authored normal through the same fabric shaping so
      // the normal map and the seams still follow the garment.
      const left = vestProfile(x - step, y, z, tucked), right = vestProfile(x + step, y, z, tucked);
      const above = vestProfile(x, y + step, z, tucked), below = vestProfile(x, y - step, z, tucked);
      const front = vestProfile(x, y, z + step, tucked), back = vestProfile(x, y, z - step, tucked);
      jacobian.set(
        right.x - left.x, above.x - below.x, front.x - back.x,
        right.y - left.y, above.y - below.y, front.y - back.y,
        right.z - left.z, above.z - below.z, front.z - back.z,
      ).invert().transpose();
      direction.fromBufferAttribute(normal, i).applyMatrix3(jacobian).normalize();
      normal.setXYZ(i, direction.x, direction.y, direction.z);
    }
    if (crowns) {
      const additions = material === "MAT_CORSET_04_05.001" ? crowns : material === "MAT_CORSET_04_00.001" ? crownTrim : undefined;
      replaceStrapCrowns(source, fitted, additions);
    }
    fitted.computeBoundingBox();
    fitted.computeBoundingSphere();
    return fitted;
  };
}

export function fitUnderbustVest(root: Object3D, body: BufferGeometry) {
  const fit = prepareUnderbustVestFit(body);
  const adjusted: { mesh: SkinnedMesh; source: BufferGeometry; fitted: BufferGeometry }[] = [];
  for (const waist of ["TUCKED", "OVER"]) {
    root.getObjectByName(`CLOTH_CORSET_${waist}`)?.traverse(mesh => {
      if (!(mesh instanceof SkinnedMesh) || Array.isArray(mesh.material)) return;
      const source = mesh.geometry;
      const fitted = fit(source, waist === "TUCKED", mesh.material.name);
      mesh.geometry = fitted;
      adjusted.push({ mesh, source, fitted });
    });
  }
  return () => {
    for (const { mesh, source, fitted } of adjusted) {
      mesh.geometry = source;
      fitted.dispose();
    }
  };
}
