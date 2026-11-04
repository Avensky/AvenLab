import { Group, InstancedMesh, Material, Mesh, type Object3D } from "three";
import type { UITheme } from "../../theme/catalog";
import { applyGarageLighting } from "../../theme/garageLighting.ts";

/** CubeCamera captures in a child layout effect, before parent effects run.
 * Give it an already-themed owned snapshot so its very first frame is correct.
 * Geometry/textures stay shared; only small material copies change per palette. */
export function createGarageReflectionSnapshot(
  roots: Object3D[],
  theme: UITheme,
  contrast: boolean,
  brightness: number,
  accentOverride: string | null = null,
) {
  const root = new Group();
  root.name = "garage-themed-reflection-probe";
  const materials = new Map<Material, Material>();
  const copy = (source: Material) => {
    let material = materials.get(source);
    if (!material) {
      material = source.clone();
      materials.set(source, material);
    }
    return material;
  };
  for (const source of roots) {
    const clone = source.clone(true);
    clone.traverse((object) => {
      if (object instanceof Mesh)
        object.material = Array.isArray(object.material)
          ? object.material.map(copy)
          : copy(object.material);
    });
    root.add(clone);
  }
  applyGarageLighting(root, theme, contrast, brightness, accentOverride);
  return {
    root,
    dispose: () => {
      root.traverse((object) => {
        if (object instanceof InstancedMesh) object.dispose();
      });
      materials.forEach((material) => material.dispose());
    },
  };
}
