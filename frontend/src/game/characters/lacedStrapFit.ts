import {
  DoubleSide, Float32BufferAttribute, MathUtils, MeshStandardMaterial, Ray, SkinnedMesh, Uint16BufferAttribute,
  Vector3, type BufferGeometry, type Object3D,
} from "three";
import type { MeshBVH } from "three-mesh-bvh";
import { prepareWardrobeCoverage, wardrobeCoverageSurface } from "./wardrobeCoverage";
import { fitWardrobeSurface } from "./wardrobeSurface";

const waistCenter = .025;

/** Roll the exposed fabric edges down so the straps have a visible seam in profile. */
function finishStrapEdges(geometry: BufferGeometry) {
  const position = geometry.getAttribute("position"), normal = geometry.getAttribute("normal");
  const joints = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
  const index = geometry.getIndex()!;
  const positions = Array.from(position.array), normals = Array.from(normal.array);
  const skinIndices = Array.from(joints.array), skinWeights = Array.from(weights.array), indices = Array.from(index.array);
  const keys = Array.from({ length: position.count }, (_, i) =>
    [position.getX(i), position.getY(i), position.getZ(i)].map(value => Math.round(value * 20000)).join(","));
  const edges = new Map<string, [number, number] | null>();
  for (let face = 0; face < index.count; face += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const a = index.getX(face + corner), b = index.getX(face + (corner + 1) % 3);
      const key = keys[a] < keys[b] ? `${keys[a]}:${keys[b]}` : `${keys[b]}:${keys[a]}`;
      edges.set(key, edges.has(key) ? null : [a, b]);
    }
  }
  const a = new Vector3(), b = new Vector3(), outward = new Vector3(), edgeNormal = new Vector3();
  function edgeVertex(source: number, lower: boolean) {
    const next = positions.length / 3;
    a.fromBufferAttribute(position, source);
    if (lower) a.addScaledVector(outward.fromBufferAttribute(normal, source), -.0026);
    positions.push(a.x, a.y, a.z);
    normals.push(edgeNormal.x, edgeNormal.y, edgeNormal.z);
    for (let channel = 0; channel < 4; channel++) {
      skinIndices.push(joints.getComponent(source, channel));
      skinWeights.push(weights.getComponent(source, channel));
    }
    return next;
  }
  for (const edge of edges.values()) {
    if (!edge) continue;
    const [first, second] = edge;
    a.fromBufferAttribute(position, first);
    b.fromBufferAttribute(position, second);
    if (a.distanceToSquared(b) < 1e-10) continue;
    edgeNormal.copy(b).sub(a).cross(outward.fromBufferAttribute(normal, first)).normalize();
    const topA = edgeVertex(first, false), topB = edgeVertex(second, false);
    const bottomA = edgeVertex(first, true), bottomB = edgeVertex(second, true);
    indices.push(topA, bottomA, topB, topB, bottomA, bottomB);
  }
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
}

function fitStraps(body: BufferGeometry) {
  const straps = fitWardrobeSurface(body, [
    point => {
      const front = MathUtils.smoothstep(point.z, -.035, .055);
      return point.y - MathUtils.lerp(1.273, 1.281, front);
    },
    point => {
      const side = Math.abs(point.x);
      const front = MathUtils.smoothstep(point.z, -.04, .055);
      const rear = .111 + .014 * MathUtils.smoothstep(point.y, 1.364, 1.404);
      const chest = .125 - .042 * MathUtils.smoothstep(point.z, .005, .08);
      const center = MathUtils.lerp(rear, chest, front);
      const backSeam = (1 - front) * (1 - MathUtils.smoothstep(point.y, 1.295, 1.322));
      const halfWidth = .0115 + .007 * backSeam;
      const armhole = front * (1 - MathUtils.smoothstep(point.y, 1.29, 1.337));
      const neckline = center - halfWidth - .003 * armhole;
      const outerEdge = center + halfWidth + .008 * front + .015 * armhole;
      return Math.min(side - neckline, outerEdge - side);
    },
  ], point => .006 + .0025 * MathUtils.smoothstep(point.y, 1.295, 1.369));
  if (straps) finishStrapEdges(straps);
  return straps;
}

function waistClearance(point: Vector3, over: boolean) {
  const low = over ? 1.096 : 1.137;
  const high = over ? 1.199 : 1.194;
  const rear = 1 - MathUtils.smoothstep(point.z, -.029, .027);
  return MathUtils.lerp(over ? .020 + .012 * rear : .013, .0025, MathUtils.smoothstep(point.y, low, high));
}

function fitWaistFacing(body: BufferGeometry, over: boolean) {
  return fitWardrobeSurface(body, [
    point => point.y - (over ? 1.032 + .010 * MathUtils.smoothstep(point.z, -.045, .065) : 1.065),
    point => 1.263 - .024 * MathUtils.smoothstep(point.z, .035, .11) - point.y,
    point => .152 - Math.abs(point.x),
  ], point => waistClearance(point, over) - .0015);
}

/** Refit the hem, back the waist seams and replace the original shoulder tabs. */
export function fitLacedBodice(root: Object3D, body: BufferGeometry) {
  const straps = fitStraps(body);
  if (!straps) return;
  root.userData.lacedBodiceStraps = true;
  const waistFacings = [fitWaistFacing(body, false), fitWaistFacing(body, true)] as const;
  const torso = wardrobeCoverageSurface(body);
  const altered: { mesh: SkinnedMesh; source: BufferGeometry; owned: BufferGeometry;
    material: MeshStandardMaterial; finish: MeshStandardMaterial }[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  const point = new Vector3(), ray = new Ray();
  for (const name of ["CLOTH_CORSET_TUCKED", "CLOTH_CORSET_OVER"]) {
    const over = name === "CLOTH_CORSET_OVER";
    root.getObjectByName(name)?.traverse(mesh => {
      if (!(mesh instanceof SkinnedMesh) || !(mesh.material instanceof MeshStandardMaterial)) return;
      const source = mesh.geometry, index = source.getIndex(), positions = source.getAttribute("position");
      if (!index || !positions) return;
      const material = mesh.material;
      const slot = material.userData.color_slot;
      const fabric = slot === "fabric";
      const kept: number[] = [];
      for (let i = 0; i < index.count; i += 3) {
        const first = index.getX(i), second = index.getX(i + 1), third = index.getX(i + 2);
        a.fromBufferAttribute(positions, first);
        b.fromBufferAttribute(positions, second);
        c.fromBufferAttribute(positions, third);
        a.add(b).add(c).multiplyScalar(1 / 3);
        const join = MathUtils.lerp(1.289, 1.306, MathUtils.smoothstep(a.z, -.04, .055));
        // The lacing ends below the old tabs. Keep the original cup and waist vertices intact.
        const upperStrap = fabric ? a.y > 1.319 || (a.y > join && Math.abs(a.x) > .072) : a.y > 1.298;
        if (!upperStrap) kept.push(first, second, third);
      }
      const owned = source.clone();
      owned.setIndex(kept);
      owned.setDrawRange(0, kept.length);
      const position = owned.getAttribute("position");
      for (let i = 0; torso && i < position.count; i++) {
        point.fromBufferAttribute(positions, i);
        if (point.y > 1.199 || (over && point.y < 1.014)) continue;
        ray.origin.set(0, point.y, waistCenter);
        ray.direction.set(point.x, 0, point.z - waistCenter).normalize();
        const radius = Math.hypot(point.x, point.z - waistCenter);
        if (!radius) continue;
        const skin = torso.raycastFirst(ray, DoubleSide, 0, .22);
        if (!skin) continue;
        const longline = over ? MathUtils.smoothstep(point.y, 1.014, 1.052) : 1;
        const taper = 1 - MathUtils.smoothstep(point.y, 1.177, 1.199);
        const standOff = fabric ? 0 : slot === "hardware" ? .002 : .001;
        const move = Math.max(0, skin.distance + waistClearance(point, over) + standOff - radius) * longline * taper;
        position.setXYZ(i, point.x + ray.direction.x * move, point.y, point.z + ray.direction.z * move);
      }
      owned.computeBoundingBox();
      owned.computeBoundingSphere();
      mesh.geometry = owned;
      const finished = material.clone();
      finished.roughness = slot === "hardware" ? .58 : .89;
      finished.metalness = slot === "hardware" ? .43 : 0;
      finished.envMapIntensity = slot === "hardware" ? .48 : .30;
      if (slot !== "hardware") finished.normalScale.multiplyScalar(.55);
      mesh.material = finished;
      altered.push({ mesh, source, owned, material, finish: finished });
    });
  }
  torso?.geometry.dispose();
  // The live actor clones these finishes for dyeing and owns those copies.
  return { straps, waistFacings, disposeShell: () => {
    for (const { mesh, source, owned, material, finish } of altered) {
      mesh.geometry = source;
      mesh.material = material;
      owned.dispose();
      finish.dispose();
    }
  } };
}

/** Keep the selected short skirt's waistband on its side of the bodice hem. */
export function fitLacedBodiceToSkirt(root: Object3D, body: BufferGeometry, skirt: readonly MeshBVH[]) {
  const torso = wardrobeCoverageSurface(body);
  if (!torso) return;
  const altered: { mesh: SkinnedMesh; source: BufferGeometry; fitted: BufferGeometry }[] = [];
  const ray = new Ray();
  const sections = 72, rows = 27, base = 1.032, step = .0055;
  const outerRadius = (surfaces: readonly MeshBVH[]) => {
    let distance = Infinity;
    for (const surface of surfaces) {
      distance = Math.min(distance, surface.raycastFirst(ray, DoubleSide, 0, .24)?.distance ?? Infinity);
    }
    return Number.isFinite(distance) ? .24 - distance : undefined;
  };
  for (const mode of ["TUCKED", "OVER"]) {
    const meshes: SkinnedMesh[] = [], cloth: MeshBVH[] = [];
    for (const name of [`CLOTH_CORSET_${mode}`, `CLOTH_CORSET_WAIST_${mode}`]) {
      root.getObjectByName(name)?.traverse(part => {
        if (!(part instanceof SkinnedMesh) || Array.isArray(part.material)) return;
        meshes.push(part);
        if (part.material.userData.color_slot !== "fabric") return;
        const surface = wardrobeCoverageSurface(part.geometry);
        if (surface) cloth.push(surface);
      });
    }
    const over = mode === "OVER";
    const adjustments = new Float32Array(sections * rows);
    for (let row = 0; row < rows; row++) {
      const y = base + row * step;
      for (let section = 0; section < sections; section++) {
        const angle = section * 2 * Math.PI / sections;
        const x = Math.sin(angle), z = Math.cos(angle);
        ray.origin.set(.24 * x, y, waistCenter + .24 * z);
        ray.direction.set(-x, 0, -z);
        const belt = outerRadius(skirt), bodice = outerRadius(cloth);
        if (belt === undefined || bodice === undefined) continue;
        const blend = MathUtils.smoothstep(y, base, 1.057) * (1 - MathUtils.smoothstep(y, 1.155, 1.175));
        let move: number;
        if (over) {
          move = MathUtils.clamp(belt + .010 - bodice, 0, .024);
        } else {
          ray.origin.set(0, y, waistCenter);
          ray.direction.negate();
          const skin = torso.raycastFirst(ray, DoubleSide, 0, .22)?.distance;
          if (skin === undefined) continue;
          move = MathUtils.clamp(Math.max(skin + .0045, belt - .006) - bodice, -.016, 0);
        }
        adjustments[row * sections + section] = move * blend;
      }
    }
    for (const mesh of meshes) {
      const source = mesh.geometry, fitted = source.clone(), position = fitted.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        const row = (position.getY(i) - base) / step;
        if (row <= 0 || row >= rows - 1) continue;
        const x = position.getX(i), z = position.getZ(i) - waistCenter;
        const radius = Math.hypot(x, z);
        if (!radius) continue;
        const section = MathUtils.euclideanModulo(Math.atan2(x, z) * sections / (2 * Math.PI), sections);
        const low = Math.floor(row), left = Math.floor(section), right = (left + 1) % sections;
        const lower = MathUtils.lerp(adjustments[low * sections + left], adjustments[low * sections + right], section - left);
        const upper = MathUtils.lerp(adjustments[(low + 1) * sections + left], adjustments[(low + 1) * sections + right], section - left);
        const scale = 1 + MathUtils.lerp(lower, upper, row - low) / radius;
        position.setX(i, x * scale);
        position.setZ(i, z * scale + waistCenter);
      }
      fitted.computeBoundingBox();
      fitted.computeBoundingSphere();
      mesh.geometry = fitted;
      altered.push({ mesh, source, fitted });
    }
    for (const surface of cloth) surface.geometry.dispose();
  }
  torso.geometry.dispose();
  return () => {
    for (const { mesh, source, fitted } of altered) {
      mesh.geometry = source;
      fitted.dispose();
    }
  };
}

export function prepareLacedShoulderMask(root: Object3D, waist: "tucked" | "over") {
  if (!root.userData.lacedBodiceStraps) return;
  const surfaces: MeshBVH[] = [];
  for (const name of [`CLOTH_CORSET_${waist.toUpperCase()}`, "CLOTH_CORSET_FACING"]) {
    root.getObjectByName(name)?.traverse(mesh => {
      if (!(mesh instanceof SkinnedMesh) || Array.isArray(mesh.material) || mesh.material.transparent
        || mesh.material.userData.color_slot === "hardware") return;
      const surface = wardrobeCoverageSurface(mesh.geometry);
      if (surface) surfaces.push(surface);
    });
  }
  if (!surfaces.length) return;
  const covered = prepareWardrobeCoverage(surfaces);
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), center = new Vector3();
  return {
    retainsFace(position: ReturnType<BufferGeometry["getAttribute"]>, first: number, second: number, third: number) {
      a.fromBufferAttribute(position, first);
      b.fromBufferAttribute(position, second);
      c.fromBufferAttribute(position, third);
      center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      const side = Math.abs(center.x);
      // Restore skin at the neckline and armhole wherever the refitted fabric leaves it exposed.
      return center.y > 1.267 && side > .058 && side < .19 && !covered(center, a, b, c, true);
    },
    dispose() { for (const { geometry } of surfaces) geometry.dispose(); },
  };
}
