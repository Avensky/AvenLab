import { Mesh, MeshPhysicalMaterial, type Material, type Object3D } from "three";

// This export has transmission=1 even on opaque brick/asphalt surfaces.
// Repair only display-owned material clones; cached GLBs and gameplay keep
// their authored state. Geometry/textures remain shared and are not disposed.
export function prepareCityShowcase(source: Object3D) {
  const root = source.clone(true);
  const materials = new Map<Material, Material>();
  const copy = (original: Material) => {
    const cached = materials.get(original);
    if (cached) return cached;
    const material = original.clone();
    if (material instanceof MeshPhysicalMaterial) {
      material.transmission = 0;
      material.thickness = 0;
    }
    materials.set(original, material);
    return material;
  };
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material) ? object.material.map(copy) : copy(object.material);
  });
  return { root, dispose: () => materials.forEach(material => material.dispose()) };
}
