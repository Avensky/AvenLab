import { Box3, DoubleSide, Float32BufferAttribute, MathUtils, MeshStandardMaterial, SkinnedMesh, Triangle, Vector3, type BufferGeometry, type Object3D } from "three";
import { fitWardrobeSurface } from "./wardrobeSurface";

const capHeight = (point: Vector3) => {
  const across = Math.abs(point.x);
  const front = 1.297 + .145 * MathUtils.smoothstep(across, .027, .069);
  const back = 1.447 - .008 * MathUtils.smoothstep(across, .093, .182);
  return MathUtils.lerp(back, front, MathUtils.smoothstep(point.z, -.01, .061));
};

const capSide = (point: Vector3) => {
  const cap = .139 + .043 * MathUtils.smoothstep(point.y, 1.302, 1.367);
  const shoulder = .014 * MathUtils.smoothstep(point.y, 1.294, 1.351)
    * (1 - MathUtils.smoothstep(Math.abs(point.z), .018, .055));
  const rear = .012 * MathUtils.smoothstep(point.y, 1.317, 1.367)
    * (1 - MathUtils.smoothstep(point.z, -.058, -.017));
  return cap + shoulder + rear;
};

const capClearance = (point: Vector3) => {
  const shoulder = MathUtils.smoothstep(point.y, 1.310, 1.372);
  const rear = MathUtils.smoothstep(Math.abs(point.x), .091, .150)
    * (1 - MathUtils.smoothstep(point.z, -.053, -.010));
  const rearCrest = MathUtils.smoothstep(point.y, 1.320, 1.352)
    * (1 - MathUtils.smoothstep(point.z, -.038, -.015));
  // A close fold at the top tracks the arm motion. The panel below it has
  // extra rear room and an extended edge around the arm opening.
  return (.0045 + shoulder * (.0015 + .003 * rear)) * (1 - .75 * rearCrest);
};

function easeFrontFold(x: number, y: number, z: number) {
  const across = Math.abs(x);
  const fold = MathUtils.smoothstep(across, .075, .092) * (1 - MathUtils.smoothstep(across, .104, .126))
    * MathUtils.smoothstep(y, 1.368, 1.379) * (1 - MathUtils.smoothstep(y, 1.392, 1.412))
    * MathUtils.smoothstep(z, -.004, .012) * (1 - MathUtils.smoothstep(z, .026, .050));
  return x + Math.sign(x) * .0015 * fold;
}

/** Fit the High Collar's inset to the skinned torso, including the shoulder caps. */
export function fitHighCollarSurface(body: BufferGeometry) {
  const fabric = fitWardrobeSurface(body, [
    point => point.y - 1.174,
    point => capSide(point) - Math.abs(point.x),
    point => capHeight(point) - point.y,
  ], capClearance);
  if (!fabric) return;

  // Span the bust with a shaped fabric panel. Its center follows the garment's
  // cut instead of contouring to every small indentation in the body mesh.
  const position = fabric.getAttribute("position"), normal = fabric.getAttribute("normal");
  const point = new Vector3(), direction = new Vector3();
  function ease(x: number, y: number, z: number) {
    const bust = MathUtils.smoothstep(y, 1.19, 1.232) * (1 - MathUtils.smoothstep(y, 1.264, 1.302));
    const center = 1 - MathUtils.smoothstep(Math.abs(x), .018, .087);
    return (.009 + .016 * center) * bust * MathUtils.smoothstep(z, .05, .083);
  }
  const step = .0002;
  for (let i = 0; i < position.count; i++) {
    const { x, y, z } = point.fromBufferAttribute(position, i);
    position.setX(i, easeFrontFold(x, y, z));
    const shift = ease(x, y, z);
    if (!shift) continue;
    position.setZ(i, z + shift);
    direction.fromBufferAttribute(normal, i);
    const nz = direction.z / (1 + (ease(x, y, z + step) - ease(x, y, z - step)) / (2 * step));
    direction.x -= nz * (ease(x + step, y, z) - ease(x - step, y, z)) / (2 * step);
    direction.y -= nz * (ease(x, y + step, z) - ease(x, y - step, z)) / (2 * step);
    direction.z = nz;
    direction.normalize();
    normal.setXYZ(i, direction.x, direction.y, direction.z);
  }
  return fabric;
}

/** Fill the narrow shoulder lacing inset with dyed fabric. */
function addHighCollarCapSeams(root: Object3D, body: BufferGeometry) {
  const torso = root.getObjectByName("BODY_WARDROBE");
  if (!(torso instanceof SkinnedMesh) || !torso.parent) return;
  let accent: MeshStandardMaterial | undefined;
  root.getObjectByName("CLOTH_CORSET_TUCKED")?.traverse(mesh => {
    if (mesh instanceof SkinnedMesh && mesh.material instanceof MeshStandardMaterial
      && mesh.material.name.startsWith("MAT_CORSET_05_01")) accent = mesh.material;
  });
  if (!accent) return;
  const frontBlend = (point: Vector3) => MathUtils.smoothstep(point.z, -.032, .052);
  const strapEdge = (side: -1 | 1) => (point: Vector3) => {
    const shoulder = MathUtils.smoothstep(point.y, 1.340, 1.410);
    const center = MathUtils.lerp(.107, .093, shoulder);
    const frontWidth = MathUtils.lerp(.004, .015, MathUtils.smoothstep(point.y, 1.340, 1.383));
    const backWidth = MathUtils.lerp(.008, .018, MathUtils.smoothstep(point.y, 1.309, 1.372));
    return MathUtils.lerp(backWidth, frontWidth, frontBlend(point)) - side * (Math.abs(point.x) - center);
  };
  const geometry = fitWardrobeSurface(body, [
    point => point.y - MathUtils.lerp(1.309, 1.340, frontBlend(point)),
    point => capHeight(point) - .003 - point.y,
    // Clip the two edges separately so a triangle can span the strap.
    strapEdge(1), strapEdge(-1),
  ], point => capClearance(point) + .001);
  if (!geometry) return;

  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) position.setX(i, easeFrontFold(position.getX(i), position.getY(i), position.getZ(i)));
  const shades = new Float32Array(position.count * 3).fill(.075);
  geometry.setAttribute("color", new Float32BufferAttribute(shades, 3));
  const material = new MeshStandardMaterial({
    name: "MAT_CORSET_05_CapSeam", color: accent.color, roughness: accent.roughness, side: DoubleSide, vertexColors: true,
  });
  material.userData.color_slot = "accent";
  const seam = torso.clone(false);
  seam.name = "CLOTH_CORSET_HIGH_COLLAR_CAP_SEAMS";
  seam.userData = { clothingPiece: "corset" };
  seam.geometry = geometry;
  seam.material = material;
  torso.parent.add(seam);
  return () => { seam.removeFromParent(); geometry.dispose(); material.dispose(); };
}

function shoulderDetail(point: Vector3, slot: unknown) {
  const across = Math.abs(point.x);
  return (slot === "accent" || slot === "hardware") && point.y > 1.339 && point.y < 1.435
    && across > .062 && across < .135 && point.z < .063;
}

/** Carry the lower rear lacing on the moving torso while the new caps supply the upper shoulder. */
export function fitHighCollarShoulders(root: Object3D, body: BufferGeometry) {
  const bodyPositions = body.getAttribute("position"), bodyNormals = body.getAttribute("normal");
  const bodyJoints = body.getAttribute("skinIndex"), bodyWeights = body.getAttribute("skinWeight"), bodyIndex = body.getIndex();
  if (!bodyPositions || !bodyNormals || !bodyJoints || !bodyWeights || !bodyIndex) return;

  type Face = { triangle: Triangle; indices: [number, number, number]; bounds: Box3 };
  const facesByCell = new Map<string, Face[]>();
  const searchRadius = .029;
  const cell = (coordinate: number) => Math.floor(coordinate / .04);
  const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), center = new Vector3();
  for (let i = 0; i < bodyIndex.count; i += 3) {
    const first = bodyIndex.getX(i), second = bodyIndex.getX(i + 1), third = bodyIndex.getX(i + 2);
    a.fromBufferAttribute(bodyPositions, first);
    b.fromBufferAttribute(bodyPositions, second);
    c.fromBufferAttribute(bodyPositions, third);
    center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if (center.y < 1.217 || center.z > .085 || Math.abs(center.x) < .035 || Math.abs(center.x) > .177) continue;
    const face: Face = {
      triangle: new Triangle(a.clone(), b.clone(), c.clone()), indices: [first, second, third],
      bounds: new Box3().setFromPoints([a, b, c]).expandByScalar(searchRadius),
    };
    const { min, max } = face.bounds;
    for (let x = cell(min.x); x <= cell(max.x); x++) {
      for (let y = cell(min.y); y <= cell(max.y); y++) {
        for (let z = cell(min.z); z <= cell(max.z); z++) {
          const key = cellKey(x, y, z), nearby = facesByCell.get(key);
          if (nearby) nearby.push(face);
          else facesByCell.set(key, [face]);
        }
      }
    }
  }

  const fitted: { mesh: SkinnedMesh; source: BufferGeometry; geometry: BufferGeometry }[] = [];
  const point = new Vector3(), closest = new Vector3(), target = new Vector3(), normal = new Vector3(), weights = new Vector3();
  const disposeSeams = addHighCollarCapSeams(root, body);
  for (const name of ["CLOTH_CORSET_TUCKED", "CLOTH_CORSET_OVER"]) {
    root.getObjectByName(name)?.traverse(mesh => {
      if (!(mesh instanceof SkinnedMesh) || Array.isArray(mesh.material)) return;
      const source = mesh.geometry, geometry = source.clone();
      const position = geometry.getAttribute("position"), skinIndex = geometry.getAttribute("skinIndex"), skinWeight = geometry.getAttribute("skinWeight");
      const slot = mesh.material.userData.color_slot;
      const index = source.getIndex();
      if (index && disposeSeams) {
        const visible: number[] = [];
        for (let i = 0; i < index.count; i += 3) {
          const first = index.getX(i), second = index.getX(i + 1), third = index.getX(i + 2);
          a.fromBufferAttribute(position, first);
          b.fromBufferAttribute(position, second);
          c.fromBufferAttribute(position, third);
          center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
          const cut = MathUtils.lerp(1.367, 1.331, MathUtils.smoothstep(center.z, -.058, .038));
          const upperCap = center.y > cut && Math.abs(center.x) > .076;
          const strayFrontTrim = slot !== "fabric" && center.y > 1.304 && center.z > .003 && Math.abs(center.x) > .057;
          const strayRearTrim = slot === "accent" && center.y > 1.376 && center.z < -.025 && Math.abs(center.x) > .055;
          if ((upperCap || strayFrontTrim || strayRearTrim) && !shoulderDetail(center, slot)) continue;
          visible.push(first, second, third);
        }
        geometry.setIndex(visible);
        geometry.setDrawRange(0, visible.length);
      }
      const authoredClearance = slot === "hardware" ? .009 : slot === "accent" ? .007 : .0055;
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i);
        const rear = 1 - MathUtils.smoothstep(point.z, -.054, -.023);
        const detail = shoulderDetail(point, slot);
        const blend = detail ? 1 : MathUtils.smoothstep(point.y, MathUtils.lerp(1.285, 1.235, rear), MathUtils.lerp(1.347, 1.294, rear))
          * MathUtils.smoothstep(Math.abs(point.x), .058, .101)
          * (1 - MathUtils.smoothstep(point.z, .031, .067));
        if (!blend) continue;
        const candidates = facesByCell.get(cellKey(cell(point.x), cell(point.y), cell(point.z)));
        if (!candidates) continue;
        let distance = searchRadius ** 2, surface: Face | undefined;
        for (const candidate of candidates) {
          if (!candidate.bounds.containsPoint(point)) continue;
          candidate.triangle.closestPointToPoint(point, closest);
          const separation = closest.distanceToSquared(point);
          if (separation >= distance) continue;
          distance = separation;
          surface = candidate;
          target.copy(closest);
        }
        if (!surface || !surface.triangle.getBarycoord(target, weights)) continue;

        const [first, second, third] = surface.indices;
        normal.set(0, 0, 0)
          .addScaledVector(a.fromBufferAttribute(bodyNormals, first), weights.x)
          .addScaledVector(b.fromBufferAttribute(bodyNormals, second), weights.y)
          .addScaledVector(c.fromBufferAttribute(bodyNormals, third), weights.z).normalize();
        const currentClearance = closest.copy(point).sub(target).dot(normal);
        const clearance = detail ? capClearance(target) + (slot === "hardware" ? .003 : .002) : authoredClearance;
        point.addScaledVector(normal, blend * MathUtils.clamp(clearance - currentClearance, 0, .014));
        position.setXYZ(i, point.x, point.y, point.z);

        const influences = new Map<number, number>();
        for (let channel = 0; channel < 4; channel++) {
          const joint = skinIndex.getComponent(i, channel);
          influences.set(joint, (influences.get(joint) ?? 0) + (1 - blend) * skinWeight.getComponent(i, channel));
          for (let corner = 0; corner < 3; corner++) {
            const vertex = surface.indices[corner], bodyJoint = bodyJoints.getComponent(vertex, channel);
            const weight = blend * weights.getComponent(corner) * bodyWeights.getComponent(vertex, channel);
            influences.set(bodyJoint, (influences.get(bodyJoint) ?? 0) + weight);
          }
        }
        const strongest = [...influences].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
        const sum = strongest.reduce((total, [, weight]) => total + weight, 0);
        for (let channel = 0; channel < 4; channel++) {
          skinIndex.setComponent(i, channel, strongest[channel]?.[0] ?? 0);
          skinWeight.setComponent(i, channel, (strongest[channel]?.[1] ?? 0) / sum);
        }
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      mesh.geometry = geometry;
      fitted.push({ mesh, source, geometry });
    });
  }
  return () => {
    disposeSeams?.();
    for (const { mesh, source, geometry } of fitted) {
      mesh.geometry = source;
      geometry.dispose();
    }
  };
}
