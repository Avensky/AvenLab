import {
  DoubleSide, Float32BufferAttribute, MathUtils, MeshStandardMaterial, Ray, SkinnedMesh, Uint16BufferAttribute,
  Vector3, type BufferGeometry, type Object3D,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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
    if (lower) a.addScaledVector(outward.fromBufferAttribute(normal, source), -.001);
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

function strapCenter(point: Vector3) {
  const front = MathUtils.smoothstep(point.z, -.043, .055);
  const scoop = MathUtils.smoothstep(point.y, 1.320, 1.358) * (1 - MathUtils.smoothstep(point.y, 1.381, 1.412));
  const rear = .109 + .016 * MathUtils.smoothstep(point.y, 1.353, 1.405) - .008 * scoop;
  const chest = .124 - .035 * MathUtils.smoothstep(point.z, .005, .080);
  return MathUtils.lerp(rear, chest, front);
}

function strapHalfWidth(point: Vector3) {
  const join = 1 - MathUtils.smoothstep(point.y, 1.280, 1.323);
  const shoulder = MathUtils.smoothstep(point.y, 1.363, 1.412);
  return .010 + .007 * join + .003 * shoulder;
}

function fitStraps(body: BufferGeometry) {
  const straps = fitWardrobeSurface(body, [
    point => {
      const rear = 1 - MathUtils.smoothstep(point.z, -.067, -.032);
      const front = MathUtils.smoothstep(point.z, .028, .077);
      return point.y - (1.326 - .055 * rear - .050 * front);
    },
    point => Math.abs(point.x) - (strapCenter(point) - strapHalfWidth(point)),
    point => strapCenter(point) + strapHalfWidth(point) - Math.abs(point.x),
    point => .114 + .033 * MathUtils.smoothstep(point.y, 1.291, 1.373)
      + .006 * MathUtils.smoothstep(point.z, .025, .068) - Math.abs(point.x),
  ], point => {
    const rear = 1 - MathUtils.smoothstep(point.z, -.046, -.008);
    const edge = MathUtils.clamp(Math.abs(Math.abs(point.x) - strapCenter(point)) / strapHalfWidth(point), 0, 1);
    const join = 1 - MathUtils.smoothstep(point.y, 1.315, 1.362);
    return .006 + (.003 + .004 * rear) * join + .001 * edge * edge;
  });
  if (straps) finishStrapEdges(straps);
  return straps;
}

function waistClearance(point: Vector3, over: boolean) {
  const low = over ? 1.096 : 1.137;
  const high = over ? 1.199 : 1.194;
  const rear = 1 - MathUtils.smoothstep(point.z, -.029, .027);
  return MathUtils.lerp(over ? .020 + .012 * rear : .013, .0025, MathUtils.smoothstep(point.y, low, high));
}

const lacingCenter = .007;
const frontFacingStart = .045;

function tuckedLacingHalfWidth(y: number) {
  const width = .007 + .009 * MathUtils.smoothstep(y, 1.112, 1.155) + .011 * MathUtils.smoothstep(y, 1.195, 1.234);
  return width * MathUtils.smoothstep(y, 1.091, 1.107);
}

export function showsTuckedLacingSkin(point: Vector3, fittedSkirt = false) {
  // A fitted waistband leaves both ends of the laced placket visible as the torso turns.
  if (fittedSkirt && point.y > 1.06 && point.y < 1.145) {
    const back = point.z < -.015 && Math.abs(point.x) < .052;
    const front = point.z > .08 && Math.abs(point.x - lacingCenter) < .033;
    if (back || front) return true;
  }
  const edge = fittedSkirt ? .019 : .014;
  return point.z > frontFacingStart && point.y > 1.087 && point.y < 1.257
    && Math.abs(point.x - lacingCenter) < tuckedLacingHalfWidth(point.y) + edge;
}

function fitWaistFacing(body: BufferGeometry, over: boolean) {
  const boundaries = [
    (point: Vector3) => point.y - (over ? 1.032 + .010 * MathUtils.smoothstep(point.z, -.045, .065) : 1.065),
    (point: Vector3) => 1.263 - .024 * MathUtils.smoothstep(point.z, .035, .11) - point.y,
    (point: Vector3) => .152 - .026 * MathUtils.smoothstep(point.y, 1.222, 1.263)
      * (1 - MathUtils.smoothstep(point.z, .042, .08)) - Math.abs(point.x),
  ];
  const clearance = (point: Vector3) => waistClearance(point, over) - .0015;
  if (over) return fitWardrobeSurface(body, boundaries, clearance);

  // Keep the back and side backing while following the open center seam of the tucked bodice.
  // Clip the front halves separately so a wide triangle cannot bridge the narrow opening.
  const back = fitWardrobeSurface(body, [...boundaries, point => frontFacingStart - point.z], clearance);
  const front = [...boundaries, (point: Vector3) => point.z - frontFacingStart];
  const left = fitWardrobeSurface(body, [...front, point => lacingCenter - tuckedLacingHalfWidth(point.y) - point.x], clearance);
  const right = fitWardrobeSurface(body, [...front, point => point.x - lacingCenter - tuckedLacingHalfWidth(point.y)], clearance);
  const panels = [back, left, right].filter((panel): panel is BufferGeometry => panel !== undefined);
  if (!panels.length) return;
  const facing = mergeGeometries(panels);
  for (const panel of panels) panel.dispose();
  return facing ?? undefined;
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
  const point = new Vector3(), ray = new Ray();
  for (const name of ["CLOTH_CORSET_TUCKED", "CLOTH_CORSET_OVER"]) {
    const over = name === "CLOTH_CORSET_OVER";
    root.getObjectByName(name)?.traverse(mesh => {
      if (!(mesh instanceof SkinnedMesh) || !(mesh.material instanceof MeshStandardMaterial)) return;
      const source = mesh.geometry;
      const material = mesh.material;
      const slot = material.userData.color_slot;
      const fabric = slot === "fabric";
      // Cut across the old tabs at the seam so a retained triangle cannot leave a spike above it.
      const owned = fitWardrobeSurface(source, [point => {
        if (!fabric) return 1.298 - point.y;
        const join = MathUtils.lerp(1.285, 1.306, MathUtils.smoothstep(point.z, -.04, .055));
        const inner = 1 - MathUtils.smoothstep(Math.abs(point.x), .060, .082);
        const armhole = MathUtils.smoothstep(Math.abs(point.x), .106, .135) * (1 - MathUtils.smoothstep(point.z, .041, .085));
        return MathUtils.lerp(join, 1.319, inner) - .036 * armhole - point.y;
      }], 0, true);
      if (!owned) return;
      const position = owned.getAttribute("position");
      for (let i = 0; torso && i < position.count; i++) {
        point.fromBufferAttribute(position, i);
        if (point.y > 1.235 && point.z < -.045) {
          const side = MathUtils.smoothstep(Math.abs(point.x), .092, .119);
          const rearJoin = MathUtils.smoothstep(point.y, 1.235, 1.270)
            * (1 - MathUtils.smoothstep(point.z, -.061, -.045));
          position.setZ(i, point.z - .006 * side * rearJoin);
        }
        if (point.y > 1.199 || (over && point.y < 1.014)) continue;
        ray.origin.set(0, point.y, waistCenter);
        ray.direction.set(point.x, 0, point.z - waistCenter).normalize();
        const radius = Math.hypot(point.x, point.z - waistCenter);
        if (!radius) continue;
        const skin = torso.raycastFirst(ray, DoubleSide, 0, .22);
        if (!skin) continue;
        const standOff = fabric ? 0 : slot === "hardware" ? .002 : .001;
        const blend = (over ? MathUtils.smoothstep(point.y, 1.014, 1.052) : 1)
          * (1 - MathUtils.smoothstep(point.y, 1.177, 1.199));
        const move = Math.max(0, skin.distance + waistClearance(point, over) + standOff - radius) * blend;
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

/** Keep a skirt's waistband on its side of the bodice hem. */
export function fitLacedBodiceToSkirt(root: Object3D, body: BufferGeometry, skirt: readonly MeshBVH[],
  village?: { hasBelt: boolean }, reuse?: { adjustments?: Float32Array },
) {
  const villageTuck = Boolean(village);
  const tuckBeltSides = village?.hasBelt && root.userData.lacedBodiceStraps;
  const saved = villageTuck ? reuse?.adjustments : undefined;
  const sections = 72, rows = villageTuck ? 53 : 27, base = villageTuck ? 1.080 : 1.032, step = villageTuck ? .001 : .0055;
  // Every waistband ray holds its height, so triangles outside this band cannot contribute.
  const height = [base, base + (rows - 1) * step] as const;
  const torso = saved ? undefined : wardrobeCoverageSurface(body, height);
  if (!saved && !torso) return;
  const altered: { mesh: SkinnedMesh; source: BufferGeometry; fitted: BufferGeometry }[] = [];
  const ray = new Ray();
  const outerRadius = (surfaces: readonly MeshBVH[]) => {
    let distance = Infinity;
    for (const surface of surfaces) {
      distance = Math.min(distance, surface.raycastFirst(ray, DoubleSide, 0, .24)?.distance ?? Infinity);
    }
    return Number.isFinite(distance) ? .24 - distance : undefined;
  };
  for (const mode of villageTuck ? ["TUCKED"] : ["TUCKED", "OVER"]) {
    const meshes: SkinnedMesh[] = [], cloth: MeshBVH[] = [];
    for (const name of [`CLOTH_CORSET_${mode}`, `CLOTH_CORSET_WAIST_${mode}`]) {
      root.getObjectByName(name)?.traverse(part => {
        if (!(part instanceof SkinnedMesh) || Array.isArray(part.material)) return;
        meshes.push(part);
        if (saved || (part.material.userData.color_slot !== "fabric" && !villageTuck)) return;
        const surface = wardrobeCoverageSurface(part.geometry, height);
        if (surface) cloth.push(surface);
      });
    }
    const over = mode === "OVER";
    const adjustments = saved ?? new Float32Array(sections * rows);
    if (torso) {
      const rimFeatherRows = 12;
      const lastBeltRow = new Int16Array(sections).fill(-rimFeatherRows);
      const lastBelt = new Float32Array(sections);
      for (let row = 0; row < rows; row++) {
        const y = base + row * step;
        for (let section = 0; section < sections; section++) {
          const angle = section * 2 * Math.PI / sections;
          const x = Math.sin(angle), z = Math.cos(angle);
          ray.origin.set(.24 * x, y, waistCenter + .24 * z);
          ray.direction.set(-x, 0, -z);
          let belt = outerRadius(skirt);
          let skirtFalloff = 1;
          if (villageTuck && belt !== undefined) {
            lastBelt[section] = belt;
            lastBeltRow[section] = row;
          } else if (villageTuck && row - lastBeltRow[section] < rimFeatherRows) {
            // Feather the inset above the narrow waistband so the last row
            // beneath the rim stays tucked when the garment moves.
            belt = lastBelt[section];
            skirtFalloff = 1 - MathUtils.smoothstep(row - lastBeltRow[section], 1, rimFeatherRows);
          }
          if (belt === undefined) continue;
          const bodice = outerRadius(cloth);
          if (bodice === undefined) continue;
          const blend = villageTuck ? skirtFalloff
            : MathUtils.smoothstep(y, base, 1.057) * (1 - MathUtils.smoothstep(y, 1.155, 1.175));
          let move: number;
          if (over) {
            move = MathUtils.clamp(belt + .010 - bodice, 0, .024);
          } else {
            ray.origin.set(0, y, waistCenter);
            ray.direction.negate();
            const skin = torso.raycastFirst(ray, DoubleSide, 0, .22)?.distance;
            if (skin === undefined) continue;
            const target = villageTuck ? Math.max(skin + .0018, belt - .009) : Math.max(skin + .0045, belt - .006);
            move = MathUtils.clamp(target - bodice, -.016, 0);
          }
          adjustments[row * sections + section] = move * blend;
        }
      }
      if (villageTuck && reuse) reuse.adjustments = adjustments;
    }
    for (const mesh of meshes) {
      const source = mesh.geometry, position = source.getAttribute("position");
      let fitted: BufferGeometry | undefined;
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i), row = (y - base) / step;
        if (row <= 0 || row >= rows - 1) continue;
        const x = position.getX(i), z = position.getZ(i) - waistCenter;
        const radius = Math.hypot(x, z);
        if (!radius) continue;
        const section = MathUtils.euclideanModulo(Math.atan2(x, z) * sections / (2 * Math.PI), sections);
        const low = Math.floor(row), left = Math.floor(section), right = (left + 1) % sections;
        const lower = MathUtils.lerp(adjustments[low * sections + left], adjustments[low * sections + right], section - left);
        const upper = MathUtils.lerp(adjustments[(low + 1) * sections + left], adjustments[(low + 1) * sections + right], section - left);
        const move = MathUtils.lerp(lower, upper, row - low);
        // At the side turn the separate Village belt rises above the skirt rim.
        // Pull the tucked hem inside that turn, tapering before the front and back panels.
        const sideTuck = tuckBeltSides ? .0035 * MathUtils.smoothstep(Math.abs(x), .065, .095)
          * (1 - MathUtils.smoothstep(Math.abs(z), .012, .034))
          * MathUtils.smoothstep(y, 1.080, 1.095) * (1 - MathUtils.smoothstep(y, 1.128, 1.132)) : 0;
        if (!move && !sideTuck) continue;
        fitted ??= source.clone();
        const target = fitted.getAttribute("position");
        const scale = 1 + move / radius;
        target.setX(i, x * scale - Math.sign(x) * sideTuck);
        target.setZ(i, z * scale + waistCenter);
      }
      if (!fitted) continue;
      fitted.computeBoundingBox();
      fitted.computeBoundingSphere();
      mesh.geometry = fitted;
      altered.push({ mesh, source, fitted });
    }
    for (const surface of cloth) surface.geometry.dispose();
  }
  torso?.geometry.dispose();
  return () => {
    for (const { mesh, source, fitted } of altered) {
      mesh.geometry = source;
      fitted.dispose();
    }
  };
}

/** Give the tucked hem room behind the Village skirt and its separate belt. */
export function prepareLacedBodiceVillageWaist(skirts: readonly SkinnedMesh[], belts: readonly SkinnedMesh[],
  sweetheart: boolean) {
  const fit = (mesh: SkinnedMesh, belt: boolean) => {
    const source = mesh.geometry, fitted = source.clone(), position = fitted.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i) - waistCenter;
      if (y <= 1.052) continue;
      const radius = Math.hypot(x, z);
      if (!radius) continue;
      const rear = -z / radius;
      const side = MathUtils.smoothstep(Math.abs(x) / radius, .27, .65);
      // Open the belt across the rear only. Keep its lower edge close to the skirt.
      const rearArc = sweetheart ? MathUtils.smoothstep(rear, .05, .52) : MathUtils.smoothstep(rear, 0, .30);
      const room = belt
        ? rearArc * MathUtils.lerp(.0055, .012, MathUtils.smoothstep(y, 1.092, 1.117))
          + (sweetheart ? .0055 : 0) * side * MathUtils.smoothstep(y, 1.091, 1.121)
        : .0055 * MathUtils.smoothstep(rear, -.42, .25) * side * MathUtils.smoothstep(y, 1.052, 1.102);
      if (!room) continue;
      const scale = 1 + room / radius;
      position.setX(i, x * scale);
      position.setZ(i, waistCenter + z * scale);
    }
    fitted.computeBoundingBox();
    fitted.computeBoundingSphere();
    return { mesh, source, fitted };
  };
  let fittedWaist: ReturnType<typeof fit>[] | undefined;
  return {
    apply(tucked: boolean) {
      if (tucked) fittedWaist ??= [...skirts.map(mesh => fit(mesh, false)), ...belts.map(mesh => fit(mesh, true))];
      for (const { mesh, source, fitted } of fittedWaist ?? []) mesh.geometry = tucked ? fitted : source;
    },
    dispose() {
      for (const { mesh, source, fitted } of fittedWaist ?? []) {
        mesh.geometry = source;
        fitted.dispose();
      }
    },
  };
}

export function prepareLacedBodyMask(root: Object3D, waist: "tucked" | "over") {
  if (!root.userData.lacedBodiceStraps) return;
  const surfaces: MeshBVH[] = [];
  const tucked = waist === "tucked";
  for (const name of [`CLOTH_CORSET_${waist.toUpperCase()}`, "CLOTH_CORSET_FACING"]) {
    root.getObjectByName(name)?.traverse(mesh => {
      if (!(mesh instanceof SkinnedMesh) || Array.isArray(mesh.material) || mesh.material.transparent
        || ["hardware", "laces", "closure"].includes(mesh.material.userData.color_slot)) return;
      const surface = wardrobeCoverageSurface(mesh.geometry);
      if (surface) surfaces.push(surface);
    });
  }
  if (!surfaces.length) return;
  const covered = prepareWardrobeCoverage(surfaces, .001);
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), center = new Vector3();
  return {
    retainsFace(position: ReturnType<BufferGeometry["getAttribute"]>, first: number, second: number, third: number) {
      a.fromBufferAttribute(position, first);
      b.fromBufferAttribute(position, second);
      c.fromBufferAttribute(position, third);
      center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      if (tucked && showsTuckedLacingSkin(center)) return true;
      // Restore skin at the neckline and armhole wherever the refitted fabric leaves it exposed.
      return isLacedShoulder(center) && !covered(center, a, b, c, true);
    },
    dispose() { for (const { geometry } of surfaces) geometry.dispose(); },
  };
}

export function isLacedShoulder(point: Vector3) {
  const side = Math.abs(point.x);
  const base = MathUtils.lerp(1.253, 1.269, MathUtils.smoothstep(point.z, .074, .105));
  return point.y > base && side > .058 && side < .19;
}
