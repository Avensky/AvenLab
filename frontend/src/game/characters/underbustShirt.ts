import { DoubleSide, MathUtils, MeshStandardMaterial, Vector3, type BufferGeometry, type SkinnedMesh } from "three";
import { UNDERBUST_SHIRT_COLORS } from "./wardrobe";
import { fitWardrobeSurface } from "./wardrobeSurface";

function sleeveEdge(point: Vector3) {
  const across = Math.abs(point.x);
  const arm = MathUtils.smoothstep(across, .145, .200);
  return Math.min(.231, .197 + .70 * (point.y - 1.360) * arm) - across;
}

function neckline(point: Vector3) {
  const front = MathUtils.smoothstep(point.z, -.045, .027);
  const shoulder = MathUtils.smoothstep(Math.abs(point.x), .025, .075);
  return MathUtils.lerp(1.435, 1.381, front) + .066 * shoulder - point.y;
}

function clearance(point: Vector3) {
  const sleeve = MathUtils.smoothstep(Math.abs(point.x), .145, .200);
  const rearFold = MathUtils.smoothstep(point.y, 1.346, 1.383)
    * (1 - MathUtils.smoothstep(point.z, -.048, -.020));
  return (.0055 + .0035 * sleeve) * (1 - .55 * rearFold);
}

function bustEase(x: number, y: number, z: number) {
  const center = 1 - MathUtils.smoothstep(Math.abs(x), .024, .083);
  const front = MathUtils.smoothstep(z, .067, .097);
  const height = MathUtils.smoothstep(y, 1.222, 1.247) * (1 - MathUtils.smoothstep(y, 1.272, 1.301));
  return .011 * center * front * height;
}

function shapeBlouse(geometry: BufferGeometry) {
  // Let the fabric span the center of the bust, and keep the original smooth shading.
  const position = geometry.getAttribute("position"), normal = geometry.getAttribute("normal");
  const direction = new Vector3(), step = .0002;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const shift = bustEase(x, y, z);
    if (!shift) continue;
    position.setZ(i, z + shift);
    direction.fromBufferAttribute(normal, i);
    direction.z /= 1 + (bustEase(x, y, z + step) - bustEase(x, y, z - step)) / (2 * step);
    direction.x -= direction.z * (bustEase(x + step, y, z) - bustEase(x - step, y, z)) / (2 * step);
    direction.y -= direction.z * (bustEase(x, y + step, z) - bustEase(x, y - step, z)) / (2 * step);
    direction.normalize();
    normal.setXYZ(i, direction.x, direction.y, direction.z);
  }
}

/** A full opaque blouse beneath the open vest, including the back and both sleeves. */
export function prepareUnderbustShirt(body: SkinnedMesh) {
  const parent = body.parent;
  if (!parent) return;
  const edges = [(point: Vector3) => point.y - 1.143, sleeveEdge, neckline];
  const blouse = fitWardrobeSurface(body.geometry, edges, clearance);
  if (!blouse) return;
  const binding = fitWardrobeSurface(body.geometry, [
    ...edges, point => Math.max(.008 - neckline(point), .006 - sleeveEdge(point)),
  ], point => clearance(point) + .0015);

  const garments = [
    { name: "CLOTH_UNDERBUST_BLOUSE", geometry: blouse, slot: "fabric", color: UNDERBUST_SHIRT_COLORS.color },
    { name: "CLOTH_UNDERBUST_BLOUSE_BINDING", geometry: binding, slot: "accent", color: UNDERBUST_SHIRT_COLORS.accent },
  ].flatMap(({ name, geometry, slot, color }) => {
    if (!geometry) return [];
    shapeBlouse(geometry);
    const material = new MeshStandardMaterial({ name, color, roughness: .93, side: DoubleSide });
    material.userData = { color_slot: slot, dye_with_outfit: false };
    const mesh = body.clone(false);
    mesh.name = name;
    mesh.userData = { wardrobeRole: "underbust-shirt", clothingPiece: "shirt" };
    mesh.geometry = geometry;
    mesh.material = material;
    parent.add(mesh);
    return [{ mesh, geometry, material }];
  });

  return () => {
    for (const { mesh, geometry, material } of garments) {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    }
  };
}
