import { Color, MeshPhysicalMaterial } from "three";
import { Mesh, MeshStandardMaterial, type Object3D } from "three";
import type { PaintFinish } from "../../vehicles/cosmetics/paintFinishes";

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
  const allowed=vehicleBodyMaterialNames[model]; if(!allowed) return;
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

export function hasVehicleFinish(name: string,model?:string) {
  if(model)return isVehicleBodyMaterial(name,model);
  return /^(Primary(?:\.\d+)?|body|ext(?:\.\d+)?|chassis(?:\.\d+)?|Paint|paint_2|Metal)$|(?:PaintTNR|Paint)_Material1$/.test(name);
}

const vehicleBodyMaterialNames:Record<string,RegExp>={
  charger70:/^Paint$/,enforcer:/^chassis$/,interceptor:/^Metal$/,skyline34:/^rNissan_SkylineGTRR34F2_1999Paint_Material1$/,
  timecar:/^(Time:BTTF_TimeMachine1_1985Paint_Material1|paint_2)$/,ae86:/^Primary(?:\.\d+)?$/,brz:/^body$/,cx30:/^body$/,mini:/^body$/,
  fortuner:/^body$/,landcruiser:/^body$/,sierra:/^body$/,camaro:/^ext(?:\.\d+)?$/,supra:/PaintTNR_Material1$/,
  "hawaii-rescue":/^Hull(?:\.\d+)?$/i,louisiana:/^asb075_louisiana_1949_154$/i,
};

export function isVehicleBodyMaterial(name:string,model:string){return vehicleBodyMaterialNames[model]?.test(name)??false;}

/** The full models, portrait bake and instanced fleet share this response. */
export function applyPaintFinish(material: MeshStandardMaterial, softness: number, finish: PaintFinish, metallic: number) {
  const amount=Math.max(0,Math.min(1,softness));
  const metal=Math.max(0,Math.min(1,metallic));
  if(typeof material.userData.showroomFactoryRoughness!=="number")material.userData.showroomFactoryRoughness=material.roughness;
  const authored = material.userData.showroomFactoryRoughness as number;
  const roughness: Record<PaintFinish, number> = {
    factory: Math.max(authored, .24), gloss: .28, satin: Math.max(.44, .2 + amount * .45),
    matte: .82, "high-gloss": .18, metallic: .34,
  };
  material.roughness=roughness[finish];
  material.metalness=finish === "metallic" ? .28 + metal * .62 : finish === "matte" ? metal * .38 : metal * .82;
  if(material instanceof MeshPhysicalMaterial) {
    material.specularColor.setRGB(Math.min(1,material.specularColor.r),Math.min(1,material.specularColor.g),Math.min(1,material.specularColor.b));
    material.specularIntensity=Math.min(1,material.specularIntensity);
    if(typeof material.userData.showroomFactoryClearcoatRoughness!=="number") material.userData.showroomFactoryClearcoatRoughness=material.clearcoatRoughness;
    material.clearcoat=finish === "matte" ? 0 : finish === "high-gloss" ? .32 : .05 + metal * .13;
    material.clearcoatRoughness=finish === "factory" ? Math.max(material.userData.showroomFactoryClearcoatRoughness as number,.24) : material.roughness;
  }
}

export function applyShowroomHighlights(root: Object3D, softness: number, finish: PaintFinish = "satin", metallic = .42, model?:string) {
  const seen=new Set<MeshStandardMaterial>();
  root.traverse(object => {
    if(!(object instanceof Mesh))return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]) {
      if(!(material instanceof MeshStandardMaterial)||seen.has(material)||
          !(model?isVehicleBodyMaterial(material.name,model):hasVehicleFinish(material.name)))continue;
      seen.add(material);
      applyPaintFinish(material, softness, finish, metallic);
    }
  });
}
