import { Mesh, MeshStandardMaterial, type Object3D } from "three";

/** The AE86 exports pure-white, fairly polished paint. Under HDR garage lamps
 * it blooms across the hood/roof. Calibrate only the owned showroom paint;
 * keep its metallic reflections, glass, cached asset and driving rig intact. */
export function prepareGarageVehiclePaint(root: Object3D, model: string) {
  if (model !== "ae86") return;
  const seen = new Set<MeshStandardMaterial>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (
        !(material instanceof MeshStandardMaterial) ||
        !/^Primary(?:\.\d+)?$/.test(material.name) ||
        seen.has(material)
      )
        continue;
      seen.add(material);
      // Leave future colored/custom paint alone. The second call is a no-op.
      if (Math.min(material.color.r, material.color.g, material.color.b) < 0.95)
        continue;
      material.color.multiplyScalar(0.72);
      material.roughness = Math.max(0.42, material.roughness);
    }
  });
}
