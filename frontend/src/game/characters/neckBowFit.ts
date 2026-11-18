import { DoubleSide, MathUtils, Ray, SkinnedMesh, type BufferGeometry, type Object3D } from "three";
import { clothingPieceFor } from "./clothingPieces";
import { wardrobeCoverageSurface } from "./wardrobeCoverage";
import { warpWardrobeGeometry } from "./warpWardrobeGeometry";

const { smoothstep, lerp, clamp } = MathUtils;
const neckCenterZ = -.012, bottom = 1.17, step = .006, rows = 52, columns = 72;
const frontColumns = 35, frontStep = .008;
const upperLayers = new Set(["shirt", "corset", "bra", "collar", "dress", "armor", "coat", "harness"]);

// A ribbon bridges a sharp neckline edge before it touches the chest below it.
function bridgeEdges(values: Float32Array, count: number, across: number) {
  for (let row = 0; row < rows; row++) {
    const offset = row * count;
    for (let x = 1; x < count; x++) values[offset + x] = Math.max(values[offset + x], values[offset + x - 1] - across);
    for (let x = count - 2; x >= 0; x--) values[offset + x] = Math.max(values[offset + x], values[offset + x + 1] - across);
  }
  for (let i = count; i < values.length; i++) values[i] = Math.max(values[i], values[i - count] - step * .85);
  for (let i = values.length - count - 1; i >= 0; i--) values[i] = Math.max(values[i], values[i + count] - step * .85);
}

function interpolate(values: Float32Array, count: number, column: number, y: number) {
  const col = Math.floor(column), next = (col + 1) % count;
  const height = clamp((y - bottom) / step, 0, rows - 1), row = Math.min(Math.floor(height), rows - 2);
  const below = lerp(values[row * count + col], values[row * count + next], column - col);
  const above = lerp(values[(row + 1) * count + col], values[(row + 1) * count + next], column - col);
  return lerp(below, above, height - row);
}

// Sample the cross-sections of the actual visible neckline. The collar wraps
// all the way around the neck, while the loose ends rest on the upper chest.
function neckSurface(geometries: BufferGeometry[]) {
  const values = new Float32Array(rows * columns), depths = new Float32Array(rows * frontColumns);
  const ray = new Ray();
  let neckline = bottom;
  for (const geometry of geometries) {
    const surface = wardrobeCoverageSurface(geometry, [bottom - step, bottom + rows * step]);
    if (!surface) continue;
    ray.direction.set(0, 0, -1);
    for (let col = 0; col < frontColumns; col++) {
      const x = (col - (frontColumns - 1) / 2) * frontStep;
      for (let row = 0; row < rows; row++) {
        const y = bottom + row * step;
        ray.origin.set(x, y, .26);
        const hit = surface.raycastFirst(ray, DoubleSide, 0, .26);
        if (!hit) continue;
        const index = row * frontColumns + col;
        depths[index] = Math.max(depths[index], hit.point.z);
        if (Math.abs(x) < .027) neckline = Math.max(neckline, y);
      }
    }
    for (let column = 0; column < columns; column++) {
      const angle = column * Math.PI * 2 / columns, x = Math.sin(angle), z = Math.cos(angle);
      ray.direction.set(-x, 0, -z);
      for (let row = 0; row < rows; row++) {
        const height = bottom + row * step;
        // Below the neck band the forward panel only needs the planar samples.
        if (height < 1.389) continue;
        const reach = z > .22 ? .216 : .099;
        ray.origin.set(reach * x, height, neckCenterZ + reach * z);
        const hit = surface.raycastFirst(ray, DoubleSide, 0, reach);
        if (!hit) continue;
        const i = row * columns + column;
        values[i] = Math.max(values[i], reach - hit.distance);
      }
    }
    surface.geometry.dispose();
  }
  bridgeEdges(values, columns, .005);
  bridgeEdges(depths, frontColumns, frontStep * .72);
  return {
    neckline,
    front(x: number, y: number) {
      return interpolate(depths, frontColumns, clamp(x / frontStep + (frontColumns - 1) / 2, 0, frontColumns - 1), y);
    },
    radius(x: number, y: number, depth: number) {
      return interpolate(values, columns, MathUtils.euclideanModulo(Math.atan2(x, depth) * columns / (2 * Math.PI), columns), y);
    },
  };
}

function foldDepth(clearance: number) {
  // A compressed fold keeps a little thickness and a nonzero shading gradient.
  return clearance >= .003 ? clearance : .003 * Math.exp(Math.max(-20, (clearance - .003) / .006));
}

function settledBow(body: ReturnType<typeof neckSurface>, cloth: ReturnType<typeof neckSurface>, village: boolean) {
  // A standing collar supports the authored attachment without lifting the knot.
  const knotOffset = lerp(-.014, 0, smoothstep(cloth.neckline, 1.31, 1.45));
  return warpWardrobeGeometry((x, y, z, target) => {
    if (village) {
      // The Village export pins this accessory to the right hip. Turn its
      // authored loops and ends toward the chest and hang them from the knot.
      const drop = 1.102 - y;
      x = .72 * (x - .091 - .34 * drop);
      y = 1.417 - .72 * drop;
      z = .040 + .38 * drop + .49 * (z - .108 - .32 * drop);
    }
    const depth = z - neckCenterZ, radius = Math.hypot(x, depth);
    if (radius < 1e-6) return target.set(x, y, z);
    const front = smoothstep(depth / radius, .05, .77);
    const loose = front * (1 - smoothstep(y, 1.394, 1.426));
    const distanceFromKnot = Math.max(0, Math.abs(x) - .009);
    const sag = loose * (.008 + distanceFromKnot * .34 + Math.max(0, depth - .05) * .12);
    const newY = y - sag + front * knotOffset;
    const newX = x * (1 - .20 * loose);
    const out = Math.hypot(newX, depth);
    const sourceSkin = body.radius(x, y, depth);
    const support = Math.max(body.radius(newX, newY, depth), cloth.radius(newX, newY, depth));
    // Preserve relief between the knot, loops, and metal details. Loose ends
    // lose some stand-off as they settle. Keep an air gap over the supporting cloth.
    const restRadius = lerp(support, sourceSkin, smoothstep(sourceSkin, 0, .035));
    const relief = foldDepth(radius - restRadius);
    const fitted = lerp(out, support + .004 + relief * (1 - .55 * loose), smoothstep(support, 0, .02));
    const frontWeight = smoothstep(z, .002, .025);
    const skinZ = body.front(x, y);
    const chest = Math.max(body.front(newX, newY), cloth.front(newX, newY));
    const restZ = lerp(chest, skinZ, smoothstep(skinZ, 0, .025));
    const clothRelief = foldDepth(z - restZ);
    // An asymmetric ribbon crosses the clavicle as the shoulder rises.
    const tallCollar = smoothstep(cloth.neckline, 1.40, 1.426) * smoothstep(newY, 1.36, 1.392);
    const shoulderRoom = smoothstep(Math.abs(newX), .048 - .022 * tallCollar, .090 - .020 * tallCollar) * lerp(.006, .019, smoothstep(newY, 1.30, 1.39));
    const frontZ = lerp(z, chest + .006 + shoulderRoom + clothRelief * (1 - .50 * loose), smoothstep(chest, 0, .023));
    return target.set(lerp(newX * fitted / out, newX, frontWeight), newY,
      lerp(neckCenterZ + depth * fitted / out, frontZ, frontWeight));
  });
}

export function prepareNeckBows(root: Object3D, skin?: BufferGeometry) {
  if (!skin) return;
  const bows: { mesh: SkinnedMesh; source: BufferGeometry; village: boolean }[] = [];
  root.traverse(mesh => {
    if (mesh instanceof SkinnedMesh && clothingPieceFor(mesh) === "bow") {
      bows.push({ mesh, source: mesh.geometry, village: mesh.name.startsWith("ACC_BOW") });
    }
  });
  if (!bows.length) return;
  let previous = "";
  let body: ReturnType<typeof neckSurface> | undefined;
  const fitted = new Map<SkinnedMesh, BufferGeometry>();
  return {
    apply() {
      const layers: BufferGeometry[] = [];
      const visible: SkinnedMesh[] = [];
      root.traverseVisible(mesh => {
        if (!(mesh instanceof SkinnedMesh)) return;
        const piece = clothingPieceFor(mesh);
        if (piece === "bow") visible.push(mesh);
        if (piece && upperLayers.has(piece) && mesh.geometry.drawRange.count > 0) layers.push(mesh.geometry);
      });
      if (!visible.length) return;
      const key = [...visible.map(mesh => mesh.uuid), ...layers.map(g => [g.uuid, g.getIndex()?.version, g.drawRange.start, g.drawRange.count].join('/'))].join(',');
      if (key === previous) return;
      previous = key;
      body ??= neckSurface([skin]);
      const cloth = neckSurface(layers);
      for (const { mesh, source, village } of bows) {
        if (!visible.includes(mesh)) continue;
        const geometry = settledBow(body, cloth, village)(source);
        if (!geometry) continue;
        if (village) {
          const spine = mesh.skeleton.bones.findIndex(bone => bone.name === "spine_04");
          const neck = mesh.skeleton.bones.findIndex(bone => bone.name === "neck_01");
          if (spine >= 0 && neck >= 0) {
            const position = geometry.getAttribute("position");
            const joints = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
            for (let i = 0; i < position.count; i++) {
              const knot = .65 * smoothstep(position.getY(i), 1.356, 1.42);
              joints.setXYZW(i, spine, neck, 0, 0);
              weights.setXYZW(i, 1 - knot, knot, 0, 0);
            }
          }
        }
        mesh.geometry = geometry;
        fitted.get(mesh)?.dispose();
        fitted.set(mesh, geometry);
      }
    },
    dispose() {
      for (const { mesh, source } of bows) mesh.geometry = source;
      for (const geometry of fitted.values()) geometry.dispose();
    },
  };
}
