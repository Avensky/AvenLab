import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, MathUtils, MeshStandardMaterial, Ray, SkinnedMesh,
  Triangle, Uint16BufferAttribute, Vector3, type Object3D,
} from "three";
import { MeshBVH } from "three-mesh-bvh";

const torsoDepth = .025;
const tuckedHem = 1.072;

// Heights in Vesper's bind space, measured from the center front to the center back.
const neckline = [
  [0, 1.283], [10, 1.295], [18, 1.310], [32, 1.326], [50, 1.332],
  [65, 1.323], [77, 1.306], [90, 1.274], [108, 1.261], [180, 1.261],
] as const;
const overHem = [
  [0, .950], [24, .953], [55, .966], [90, .995], [115, .991], [180, .976],
] as const;

function patternHeight(angle: number, pattern: readonly (readonly [number, number])[]) {
  const degrees = Math.abs(angle) * MathUtils.RAD2DEG;
  for (let i = 1; i < pattern.length; i++) {
    const [end, upper] = pattern[i];
    if (degrees > end) continue;
    const [start, lower] = pattern[i - 1];
    const span = end - start, slope = (upper - lower) / span;
    const before = pattern[i - 2], after = pattern[i + 1];
    const incoming = before ? joinSlope((lower - before[1]) / (start - before[0]), slope) : 0;
    const outgoing = after ? joinSlope(slope, (after[1] - upper) / (after[0] - end)) : 0;
    const t = (degrees - start) / span;
    return MathUtils.lerp(lower, upper, t * t * (3 - 2 * t))
      + span * t * (1 - t) * ((1 - t) * incoming - t * outgoing);
  }
  return pattern[pattern.length - 1][1];
}

function joinSlope(before: number, after: number) {
  return before * after > 0 ? 2 * before * after / (before + after) : 0;
}

function radialSurface(source: BufferGeometry) {
  const options = { indirect: true, setBoundingBox: false };
  return new MeshBVH(source, options);
}

function spineWeights(y: number) {
  // Match the bundled skirt's spine field at the tucked seam.
  const levels = [.94, 1.025, 1.10, 1.17, 1.245, 1.325];
  const upper = y >= levels[5] ? 5 : Math.max(1, levels.findIndex(level => y <= level));
  const lower = upper - 1;
  const t = MathUtils.smoothstep(y, levels[lower], levels[upper]);
  return { joints: [lower, upper, 0, 0], weights: [1 - t, t, 0, 0] };
}

function panelPattern(body: BufferGeometry, bodySurface: MeshBVH, oldShell: MeshBVH, tucked: boolean) {
  const detailed = oldShell.geometry.getIndex()!.count > 15000;
  const sectors = detailed ? 112 : 80;
  const rows = detailed ? 34 : 24;
  const bodyPosition = body.getAttribute("position");
  const bodyJoints = body.getAttribute("skinIndex"), bodyWeights = body.getAttribute("skinWeight");
  const ray = new Ray();
  const triangle = new Triangle(), barycentric = new Vector3();

  function sample(angle: number, y: number) {
    const ux = Math.sin(angle), uz = Math.cos(angle);
    ray.origin.set(0, y, torsoDepth);
    ray.direction.set(ux, 0, uz);
    const hit = bodySurface.raycastFirst(ray, DoubleSide, .032, .22);
    const oldRadius = y < 1.16 ? oldShell.raycastFirst(ray, DoubleSide, .032, .24)?.distance : undefined;
    const bodyRadius = hit?.distance ?? oldRadius ?? .10;
    const front = MathUtils.smoothstep(uz, .20, .72);
    const cup = front * MathUtils.smoothstep(y, 1.176, 1.245);
    const waist = MathUtils.smoothstep(y, 1.088, 1.126);
    const gap = tucked ? MathUtils.lerp(.003, .012, waist) : .012 + .015 * (1 - waist);
    const authoredFlare = tucked ? 0 : Math.max(0, (oldRadius ?? bodyRadius) - bodyRadius - gap)
      * (1 - MathUtils.smoothstep(y, 1.076, 1.16));
    const underCup = front * MathUtils.smoothstep(y, 1.147, 1.180) * (1 - MathUtils.smoothstep(y, 1.190, 1.230));
    const radius = bodyRadius + gap + .004 * cup + .009 * underCup + authoredFlare;

    let { joints, weights } = spineWeights(y);
    // Follow the same skin triangles above the waist as the arms move.
    const skinBlend = MathUtils.smoothstep(y, 1.105, 1.185);
    if (skinBlend && hit?.face) {
      const { a, b, c } = hit.face;
      triangle.setFromAttributeAndIndices(bodyPosition, a, b, c);
      if (triangle.getBarycoord(hit.point, barycentric)) {
        const influences = new Map<number, number>();
        function add(joint: number, weight: number) {
          if (weight > 0) influences.set(joint, (influences.get(joint) ?? 0) + weight);
        }
        for (let channel = 0; channel < 4; channel++) {
          add(joints[channel], weights[channel] * (1 - skinBlend));
          for (const [vertex, factor] of [[a, barycentric.x], [b, barycentric.y], [c, barycentric.z]]) {
            add(bodyJoints.getComponent(vertex, channel), bodyWeights.getComponent(vertex, channel) * factor * skinBlend);
          }
        }
        const strongest = [...influences].sort((a, b) => b[1] - a[1]).slice(0, 4);
        const total = strongest.reduce((sum, [, weight]) => sum + weight, 0);
        joints = Array.from({ length: 4 }, (_, i) => strongest[i]?.[0] ?? 0);
        weights = Array.from({ length: 4 }, (_, i) => (strongest[i]?.[1] ?? 0) / total);
      }
    }
    return { radius, ux, uz, joints, weights };
  }

  function shell() {
    const joints: number[] = [], weights: number[] = [], indices: number[] = [];
    const columns = Array.from({ length: sectors }, (_, column) => {
      const angle = column / sectors * 2 * Math.PI - Math.PI;
      const top = patternHeight(angle, neckline);
      const bottom = tucked ? tuckedHem : patternHeight(angle, overHem);
      return Array.from({ length: rows + 1 }, (_, row) => {
        const y = MathUtils.lerp(bottom, top, row / rows);
        return { y, ...sample(angle, y) };
      });
    });
    // Smooth across small facets in the body scan and retain clearance in the
    // cup valleys. Start above the tucked seam to preserve the skirt overlap.
    let radii = columns.map(vertices => vertices.map(vertex => vertex.radius));
    for (let pass = 0; pass < 3; pass++) {
      radii = radii.map((column, x) => column.map((radius, y) => {
        const vertex = columns[x][y];
        if (vertex.y < 1.112) return radius;
        const left = radii[(x + sectors - 1) % sectors][y];
        const right = radii[(x + 1) % sectors][y];
        const low = column[Math.max(0, y - 1)], high = column[Math.min(rows, y + 1)];
        const average = (2 * radius + left + right + low + high) / 6;
        return Math.max(vertex.radius - .004, average);
      }));
    }

    const positions: number[] = [];
    const stride = rows + 2; // One extra ring finishes the inside of the neckline.
    for (let column = 0; column < sectors; column++) {
      const vertices = columns[column];
      for (let row = 0; row < stride; row++) {
        const innerEdge = row > rows;
        const vertex = vertices[Math.min(row, rows)];
        const back = 1 - MathUtils.smoothstep(vertex.uz, -.6, .25);
        const edge = MathUtils.smoothstep(row / rows, .86, 1);
        let radius = radii[column][Math.min(row, rows)] - .004 * back * edge;
        if (innerEdge) radius -= .007;
        positions.push(radius * vertex.ux, vertex.y - (innerEdge ? .0012 : 0), torsoDepth + radius * vertex.uz);
        joints.push(...vertex.joints);
        weights.push(...vertex.weights);
        if (innerEdge) continue;
        const a = column * stride + row;
        const b = ((column + 1) % sectors) * stride + row;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geometry = new BufferGeometry()
      .setAttribute("position", new Float32BufferAttribute(positions, 3))
      .setAttribute("skinIndex", new Uint16BufferAttribute(joints, 4))
      .setAttribute("skinWeight", new Float32BufferAttribute(weights, 4))
      .setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function lacing(source: BufferGeometry, newShell: MeshBVH, hardware: boolean) {
    const geometry = source.clone();
    const position = geometry.getAttribute("position"), authored = source.getAttribute("position"), sourceIndex = source.getIndex()!;
    const skinIndex = geometry.getAttribute("skinIndex"), skinWeight = geometry.getAttribute("skinWeight");
    const indices: number[] = [];
    const fitted = new Set<number>();
    for (let i = 0; i < sourceIndex.count; i += 3) {
      const face = [sourceIndex.getX(i), sourceIndex.getX(i + 1), sourceIndex.getX(i + 2)];
      // Keep the original front closure. The new back is a continuous fabric panel.
      if (face.some(vertex => Math.abs(authored.getX(vertex)) > .057
        || authored.getZ(vertex) < .067 || authored.getY(vertex) < 1.094)) continue;
      indices.push(...face);
      for (const vertex of face) {
        if (fitted.has(vertex)) continue;
        fitted.add(vertex);
        const x = authored.getX(vertex), y = authored.getY(vertex), z = authored.getZ(vertex) - torsoDepth;
        const angle = Math.atan2(x, z);
        const at = sample(angle, y);
        ray.origin.set(0, y, torsoDepth);
        ray.direction.set(at.ux, 0, at.uz);
        const oldRadius = oldShell.raycastFirst(ray, DoubleSide, .032, .24)?.distance ?? Math.hypot(x, z);
        const surface = newShell.raycastFirst(ray, DoubleSide, .032, .24)?.distance ?? at.radius;
        const relief = MathUtils.clamp(Math.hypot(x, z) - oldRadius, .0015, hardware ? .006 : .004);
        const radius = surface + relief;
        position.setXYZ(vertex, radius * at.ux, y, torsoDepth + radius * at.uz);
        skinIndex.setXYZW(vertex, at.joints[0], at.joints[1], at.joints[2], at.joints[3]);
        skinWeight.setXYZW(vertex, at.weights[0], at.weights[1], at.weights[2], at.weights[3]);
      }
    }
    geometry.setIndex(indices);
    geometry.setDrawRange(0, indices.length);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
  return { shell, lacing };
}

/** Rebuild both corset patterns on the complete body shared by the fitting room and outfit. */
export function rebuildSweetheartCorset(root: Object3D, body: BufferGeometry) {
  const bodySurface = radialSurface(body);
  const parts: {
    mesh: SkinnedMesh; sourceGeometry: BufferGeometry; sourceMaterial: MeshStandardMaterial;
    geometry: BufferGeometry; material: MeshStandardMaterial;
  }[] = [];
  for (const fit of ["TUCKED", "OVER"]) {
    const meshes: SkinnedMesh<BufferGeometry, MeshStandardMaterial>[] = [];
    root.getObjectByName(`CLOTH_CORSET_${fit}`)?.traverse(mesh => {
      if (mesh instanceof SkinnedMesh && mesh.material instanceof MeshStandardMaterial) meshes.push(mesh);
    });
    const fabric = meshes.find(mesh => mesh.material.userData.color_slot === "fabric");
    if (!fabric) continue;
    const pattern = panelPattern(body, bodySurface, radialSurface(fabric.geometry), fit === "TUCKED");
    const shell = pattern.shell();
    const surface = radialSurface(shell);
    for (const mesh of meshes) {
      const sourceGeometry = mesh.geometry, sourceMaterial = mesh.material;
      const hardware = sourceMaterial.userData.color_slot === "hardware";
      const geometry = mesh === fabric ? shell : pattern.lacing(sourceGeometry, surface, hardware);
      const material = sourceMaterial.clone();
      material.roughness = mesh === fabric ? .94 : hardware ? .66 : .91;
      material.metalness = hardware ? .25 : 0;
      parts.push({ mesh, sourceGeometry, sourceMaterial, geometry, material });
      mesh.geometry = geometry;
      mesh.material = material;
    }
  }
  return () => {
    for (const { mesh, sourceGeometry, sourceMaterial, geometry, material } of parts) {
      mesh.geometry = sourceGeometry;
      mesh.material = sourceMaterial;
      geometry.dispose();
      material.dispose();
    }
  };
}
