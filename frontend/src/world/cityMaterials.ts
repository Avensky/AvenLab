import { Mesh, MeshPhysicalMaterial, type Object3D } from "three";

// One shared variant per imported asset, reused by every repeated city tile.
// Geometry, textures and exported transforms stay owned by the GLTF cache.
const opaqueVariants = new WeakMap<Object3D, Object3D>();
export function cityMaterialScene(scene: Object3D, opaqueMaterials: boolean): Object3D {
  if (!opaqueMaterials) return scene;
  const cached = opaqueVariants.get(scene);
  if (cached) return cached;
  const variant = scene.clone(true);
  const materials = new Map<MeshPhysicalMaterial, MeshPhysicalMaterial>();
  const opaque = (material: MeshPhysicalMaterial) => {
    if (!(material instanceof MeshPhysicalMaterial) || material.transmission <= 0 || material.name.toLowerCase() === "glass") return material;
    let replacement = materials.get(material);
    if (!replacement) {
      replacement = material.clone(); replacement.transmission = 0; replacement.needsUpdate = true;
      materials.set(material, replacement);
    }
    return replacement;
  };
  variant.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material) ? object.material.map(opaque) : opaque(object.material);
  });
  opaqueVariants.set(scene, variant);
  return variant;
}
