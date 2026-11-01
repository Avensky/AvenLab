import { Mesh, type Material, type Object3D } from "three";

type MaterialState = {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
};
export function previewMaterialState(root: Object3D) {
  const saved = new Map<Material, MaterialState>();
  root.traverse((node) => {
    if (node instanceof Mesh)
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material])
        if (!saved.has(material))
          saved.set(material, {
            opacity: material.opacity,
            transparent: material.transparent,
            depthWrite: material.depthWrite,
          });
  });
  return saved;
}

/** Imperative Three materials belong to the prepared preview clone. Applying a
 * ghost twice is idempotent and restoring preserves authored glass settings. */
export function setPreviewGhost(
  materials: Map<Material, MaterialState>,
  ghost: boolean,
) {
  for (const [material, original] of materials) {
    material.opacity = ghost ? original.opacity * 0.23 : original.opacity;
    material.transparent = ghost || original.transparent;
    material.depthWrite = ghost ? false : original.depthWrite;
    material.needsUpdate = true;
  }
}
