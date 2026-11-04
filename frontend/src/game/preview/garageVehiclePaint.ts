import { Color, MeshPhysicalMaterial } from "three";
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

/** Paint only explicitly identified body materials on instance-owned clones.
 * Texture atlases, glass, lights, trim and cached GLBs are never recolored. */
export function applyShowroomPaint(root: Object3D, model: string, finish: "factory" | "hot-pink" | "pastel-pink", overrideColor?: string) {
  const names: Record<string, RegExp> = {ae86:/^Primary(?:\.\d+)?$/,brz:/^body$/,cx30:/^body$/,mini:/^body$/,fortuner:/^body$/,landcruiser:/^body$/,sierra:/^body$/,camaro:/^ext(?:\.\d+)?$/,supra:/PaintTNR_Material1$/};
  const allowed=names[model]; if(!allowed) return;
  const seen=new Set<MeshStandardMaterial>();
  root.traverse(object => {
    if(!(object instanceof Mesh)) return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]) {
      if(!(material instanceof MeshStandardMaterial)||!allowed.test(material.name)||seen.has(material))continue;
      seen.add(material);
      if(!material.userData.showroomFactoryColor) material.userData.showroomFactoryColor=material.color.clone();
      const original=material.userData.showroomFactoryColor as Color;
      material.color.copy(overrideColor ? new Color(overrideColor) : finish==="factory"?original:new Color(finish==="hot-pink"?"#ed258d":"#ed9dcc"));
    }
  });
}

/** All showroom body paints share a low-glare finish control. Zero is glossy,
 * one is satin. Store the authored finish so repeated updates never drift. */
export function applyShowroomHighlights(root: Object3D, softness: number, finish: "factory" | "frs" | "soft" = "soft") {
  const amount=Math.max(0,Math.min(1,softness));
  const seen=new Set<MeshStandardMaterial>();
  root.traverse(object => {
    if(!(object instanceof Mesh))return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]) {
      if(!(material instanceof MeshStandardMaterial)||seen.has(material)||
          !/^(Primary(?:\.\d+)?|body|ext(?:\.\d+)?|chassis(?:\.\d+)?)$|PaintTNR_Material1$/.test(material.name))continue;
      seen.add(material);
      if(typeof material.userData.showroomFactoryRoughness!=="number")material.userData.showroomFactoryRoughness=material.roughness;
      const authored = material.userData.showroomFactoryRoughness as number;
      // BRZ/FR-S reference finish: broader glints, without additive particles.
      material.roughness=finish === "factory" ? authored : finish === "frs" ? .20529644 : Math.max(authored,.2+amount*.45);
      if(material instanceof MeshPhysicalMaterial) {
        material.specularColor.setRGB(Math.min(1,material.specularColor.r),Math.min(1,material.specularColor.g),Math.min(1,material.specularColor.b));
        if(typeof material.userData.showroomFactoryClearcoatRoughness!=="number") material.userData.showroomFactoryClearcoatRoughness=material.clearcoatRoughness;
        material.clearcoatRoughness=finish === "factory" ? material.userData.showroomFactoryClearcoatRoughness as number : finish === "frs" ? .04 : Math.max(.25,material.roughness);
      }
    }
  });
}
