import {prepareLampLenses} from "./lampLenses.ts";
import { repairAe86Material, repairSupraHighlights } from "./assetMaterialRepairs.ts";
import { Color, DoubleSide, Group, Material, MathUtils, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Object3D } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

export const CAMARO_GLASS_PARTS = new Set([
  "SUNROOF_window", "FRONT_windows", "WINDSHIELD", "REAR_WINDOW",
  "RIGHT_QUARTER_WINDOW", "LEFT_QUARTER_WINDOW", "LEFT_WINDOW", "RIGHT_WINDOWS",
]);
const camaroGlassNames = new Set([...CAMARO_GLASS_PARTS].map(name => name.toLowerCase()));
export type MaterialRepairModel = string;

export function isSupraWindowMaterial(name: string) {
  const lower = name.toLowerCase();
  // Window meshes also contain seals and lamp slots; never turn the whole mesh into glass.
  return !lower.includes("surr") && !lower.includes("red_glass") && /window(?:inside)?_material/.test(lower);
}
function isCamaroWindow(object: Object3D) {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (camaroGlassNames.has(String(current.userData.name ?? current.name).toLowerCase())) return true;
  }
  return false;
}

const nonWindowGlass = /(?:red|amber|ambar|orange|oarnge|blue)_?glass|glass_?surr|surround|frame|mirror|lamp|light|lens|instrument/i;
/** All vehicle windows use the BRZ/FR-S neutral tinted-glass profile. Lamp
 * covers, mirrors, and colored marker lenses keep their authored materials. */
export function isVehicleWindowMaterial(name: string, object?: Object3D, model?: string) {
  if (model === "camaro" && object && isCamaroWindow(object)) return true;
  if (nonWindowGlass.test(name)) return false;
  const candidates = [name, object?.name ?? ""];
  return candidates.some(value => /window|windshield|windscreen|wind_screen|windowglass/i.test(value));
}

function asPhysicalGlass(source: Material) {
  let material: MeshPhysicalMaterial;
  if(source instanceof MeshPhysicalMaterial)material=source.clone();
  else if(source instanceof MeshStandardMaterial)material=new MeshPhysicalMaterial({
    color:source.color,map:source.map,emissive:source.emissive,emissiveMap:source.emissiveMap,
    roughness:source.roughness,roughnessMap:source.roughnessMap,metalness:source.metalness,metalnessMap:source.metalnessMap,
    normalMap:source.normalMap,normalScale:source.normalScale,aoMap:source.aoMap,aoMapIntensity:source.aoMapIntensity,
    alphaMap:source.alphaMap,transparent:source.transparent,opacity:source.opacity,alphaTest:source.alphaTest,
    side:source.side,depthWrite:source.depthWrite,depthTest:source.depthTest,wireframe:source.wireframe,
  });
  else {
    const clone=source.clone();
    if(clone instanceof MeshPhysicalMaterial)material=clone;
    else if(clone instanceof MeshStandardMaterial)material=new MeshPhysicalMaterial({color:clone.color,map:clone.map,emissive:clone.emissive,emissiveMap:clone.emissiveMap,roughness:clone.roughness,metalness:clone.metalness,alphaMap:clone.alphaMap,transparent:clone.transparent,opacity:clone.opacity,side:clone.side});
    else return clone;
  }
  material.name = source.name;
  material.color.set(0x556677);
  material.transparent = true;
  material.opacity = 0.42;
  material.depthWrite = false;
  material.alphaTest = 0;
  material.roughness = 0.12;
  material.metalness = 0;
  material.ior = 1.45;
  material.transmission = 0;
  material.side = DoubleSide;
  material.forceSinglePass = true;
  material.needsUpdate = true;
  return material;
}

// Used by both the complete-GLB preview and the runtime TSX rigs. Textures and
// geometry remain shared; only materials belong to a particular vehicle instance.
export function createVehicleMaterial(source: Material, glass: boolean, model: MaterialRepairModel): Material {
  if (glass) return asPhysicalGlass(source);
  const material = source.clone();
  if (material instanceof MeshStandardMaterial && model !== "ae86") {
    // GLBs contain widely varying HDR chrome defaults. Keep each model's
    // textures and color, but prevent mirror-sharp highlights in the shared
    // showroom and portrait pipeline.
    material.roughness = Math.max(material.roughness, material.metalness >= 0.5 ? 0.24 : 0.16);
    material.metalness = Math.min(material.metalness, 0.88);
    if (material instanceof MeshPhysicalMaterial) {
      material.specularIntensity = Math.min(material.specularIntensity, 1);
      material.specularColor.setRGB(Math.min(1, material.specularColor.r), Math.min(1, material.specularColor.g), Math.min(1, material.specularColor.b));
      material.clearcoatRoughness = Math.max(material.clearcoatRoughness, 0.2);
    }
  }
  if(model === "supra" && !glass) repairSupraHighlights(material);
  material.needsUpdate = true;
  return material;
}

export function prepareVehicleVisual(scene: Group, model: string) {
  // Clone the complete scene, including wheel collections beside VEHICLE_ROOT.
  const root = cloneSkeleton(scene) as Group;
  const materials = new Set<Material>();
  const glassMaterials = new Set<MeshPhysicalMaterial>();
  // Every vehicle receives instance-owned materials, one shared mapping for
  // windows, and the same highlight calibration. Texture maps remain intact.
  const cache = new Map<Material, Map<boolean, Material>>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const repair = (source: Material) => {
      const glass = isVehicleWindowMaterial(source.name, object, model) || (model === "supra" && isSupraWindowMaterial(source.name));
      let variants = cache.get(source);
      if (!variants) { variants = new Map(); cache.set(source, variants); }
      let material = variants.get(glass);
      if (!material) {
        material = createVehicleMaterial(source, glass, model);
        if (!glass && model === "ae86") repairAe86Material(material);
        variants.set(glass, material); materials.add(material);
        if (glass && material instanceof MeshPhysicalMaterial) glassMaterials.add(material);
      }
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(repair) : repair(object.material);
  });
  const releaseLenses=prepareLampLenses(root);
  return { root, materials, glassMaterials, dispose: () => { releaseLenses(); for (const material of materials) material.dispose(); } };
}

const interiorTint = new Color(0xffffff);
const exteriorTint = new Color(0x556677);
export function updateVehicleGlass(materials: Iterable<MeshPhysicalMaterial>, firstPerson: boolean, alpha: number) {
  for (const material of materials) {
    material.opacity = MathUtils.lerp(material.opacity, firstPerson ? 0.08 : 0.42, alpha);
    material.ior = MathUtils.lerp(material.ior, firstPerson ? 1 : 1.45, alpha);
    material.color.lerp(firstPerson ? interiorTint : exteriorTint, alpha);
  }
}
