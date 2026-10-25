import { Color, DoubleSide, Group, Material, MathUtils, Mesh, MeshPhysicalMaterial, type Object3D } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

export const CAMARO_GLASS_PARTS = new Set([
  "SUNROOF_window", "FRONT_windows", "WINDSHIELD", "REAR_WINDOW",
  "RIGHT_QUARTER_WINDOW", "LEFT_QUARTER_WINDOW", "LEFT_WINDOW", "RIGHT_WINDOWS",
]);
const camaroGlassNames = new Set([...CAMARO_GLASS_PARTS].map(name => name.toLowerCase()));
export type MaterialRepairModel = "camaro" | "supra";

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

// Used by both the complete-GLB preview and the runtime TSX rigs. Textures and
// geometry remain shared; only materials belong to a particular vehicle instance.
export function createVehicleMaterial(source: Material, glass: boolean, model: MaterialRepairModel): Material {
  if (glass && model === "supra") {
    const material = new MeshPhysicalMaterial({ color: 0x556677, transparent: true, opacity: 0.42,
      depthWrite: false, roughness: 0.1, metalness: 0, ior: 1.45, side: DoubleSide });
    material.name = source.name;
    return material;
  }
  const material = source.clone();
  material.transparent = glass;
  material.opacity = glass ? 0.6 : 1;
  material.depthWrite = !glass;
  material.alphaTest = 0;
  material.needsUpdate = true;
  return material;
}

export function prepareVehicleVisual(scene: Group, model: string) {
  // Clone the complete scene, including wheel collections beside VEHICLE_ROOT.
  const root = cloneSkeleton(scene) as Group;
  const materials = new Set<Material>();
  const glassMaterials = new Set<MeshPhysicalMaterial>();
  if (model === "camaro" || model === "supra") {
    const cache = new Map<Material, Map<boolean, Material>>();
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const repair = (source: Material) => {
        const glass = model === "supra" ? isSupraWindowMaterial(source.name) : isCamaroWindow(object);
        let variants = cache.get(source);
        if (!variants) { variants = new Map(); cache.set(source, variants); }
        let material = variants.get(glass);
        if (!material) {
          material = createVehicleMaterial(source, glass, model);
          variants.set(glass, material); materials.add(material);
          if (glass && material instanceof MeshPhysicalMaterial) glassMaterials.add(material);
        }
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(repair) : repair(object.material);
    });
  }
  return { root, materials, glassMaterials, dispose: () => { for (const material of materials) material.dispose(); } };
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
