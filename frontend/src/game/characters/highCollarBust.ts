import { MathUtils, Matrix3, Vector3, type BufferGeometry } from "three";

const fittedCups = new WeakMap<BufferGeometry, BufferGeometry>();
const { smoothstep } = MathUtils;

// Vesper bind space is in metres, with the center closure at x = 0 and the front at +z.
function cupOffset(x: number, y: number, z: number, target: Vector3) {
  const across = Math.abs(x);
  const front = smoothstep(z, .060, .108);
  const weight = front * smoothstep(y, 1.183, 1.244) * (1 - smoothstep(y, 1.265, 1.352))
    * smoothstep(across, .026, .066) * (1 - smoothstep(across, .092, .143));
  // Close the lip along the torso while keeping the curved fabric over the bust apex.
  const depth = MathUtils.lerp(-.0045, x < 0 ? .0055 : .006, smoothstep(across, .078, .102));
  const apex = front * smoothstep(across, .087, .098) * (1 - smoothstep(across, .108, .128))
    * smoothstep(y, 1.222, 1.248) * (1 - smoothstep(y, 1.274, 1.300));
  const lip = smoothstep(across, .057, .078) * (1 - smoothstep(across, x < 0 ? .086 : .091, x < 0 ? .094 : .099))
    * smoothstep(y, 1.216, 1.246) * (1 - smoothstep(y, 1.271, 1.310)) * smoothstep(z, .068, .105);
  // The right and left panels need different clearances when Vesper raises her arms.
  const inward = (x < 0 ? .007 : -.011) * weight + (x < 0 ? .002 : -.0015) * lip;
  const forward = depth * weight + (x < 0 ? .002 : .0045) * apex - .003 * lip * smoothstep(y, 1.242, 1.254);
  return target.set(inward, 0, forward);
}

// A zero tangent gives the normal-map shader an undefined frame. Even a few
// non-finite HDR pixels spread across the entire desktop view in the bloom pass.
function repairCollarTangents(geometry: BufferGeometry, missing: number[]) {
  const authored = geometry.getAttribute("tangent");
  const normals = geometry.getAttribute("normal");
  if (!authored || !normals || !geometry.index || !geometry.getAttribute("uv")) return;
  const direction = new Vector3(), normal = new Vector3();
  geometry.deleteAttribute("tangent");
  geometry.computeTangents();
  const recovered = geometry.getAttribute("tangent");
  for (const i of missing) {
    direction.fromBufferAttribute(recovered, i);
    if (direction.lengthSq() < .000001) {
      // Seam and binding triangles with collapsed UVs have no texture axis.
      // Use a stable orthogonal frame on those vertices to preserve the fabric normal.
      normal.fromBufferAttribute(normals, i);
      if (Math.abs(normal.y) < .9) direction.set(0, 1, 0);
      else direction.set(1, 0, 0);
      direction.cross(normal).normalize();
    }
    authored.setXYZW(i, direction.x, direction.y, direction.z, recovered.getW(i) < 0 ? -1 : 1);
  }
  geometry.setAttribute("tangent", authored);
}

/** Draw the two inner cup edges together in the authored High Collar's bind space. */
export function fitHighCollarBust(source: BufferGeometry) {
  const cached = fittedCups.get(source);
  if (cached) return cached;
  const positions = source.getAttribute("position");
  const tangents = source.getAttribute("tangent");
  const missingTangents: number[] = [];
  const shift = new Vector3(), sample = new Vector3(), direction = new Vector3();
  const dx = new Vector3(), dy = new Vector3(), dz = new Vector3();
  const deformation = new Matrix3(), normalMatrix = new Matrix3();
  const step = .0001;
  let fitted: BufferGeometry | undefined;
  for (let i = 0; i < positions.count; i++) {
    if (tangents && direction.fromBufferAttribute(tangents, i).lengthSq() < .000001) missingTangents.push(i);
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    cupOffset(x, y, z, shift);
    if (!shift.x) continue;
    fitted ??= source.clone();
    fitted.getAttribute("position").setXYZ(i, x + shift.x, y, z + shift.z);

    // Transform the authored shading frame along with the cloth and its binding.
    cupOffset(x + step, y, z, dx).sub(cupOffset(x - step, y, z, sample)).multiplyScalar(.5 / step);
    cupOffset(x, y + step, z, dy).sub(cupOffset(x, y - step, z, sample)).multiplyScalar(.5 / step);
    cupOffset(x, y, z + step, dz).sub(cupOffset(x, y, z - step, sample)).multiplyScalar(.5 / step);
    deformation.set(1 + dx.x, dy.x, dz.x, 0, 1, 0, dx.z, dy.z, 1 + dz.z);
    const normal = fitted.getAttribute("normal");
    if (normal) {
      normalMatrix.copy(deformation).invert().transpose();
      direction.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      normal.setXYZ(i, direction.x, direction.y, direction.z);
    }
    const tangent = fitted.getAttribute("tangent");
    if (tangent) {
      direction.fromBufferAttribute(tangent, i).applyMatrix3(deformation).normalize();
      tangent.setXYZ(i, direction.x, direction.y, direction.z);
    }
  }
  // Some parts lie outside the cup adjustment but share the defective export.
  if (missingTangents.length) {
    fitted ??= source.clone();
    repairCollarTangents(fitted, missingTangents);
  }
  if (fitted) {
    fitted.computeBoundingBox();
    fitted.computeBoundingSphere();
    const geometry = fitted;
    source.addEventListener("dispose", () => geometry.dispose());
  }
  fittedCups.set(source, fitted ?? source);
  return fitted ?? source;
}
