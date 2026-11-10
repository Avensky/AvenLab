import {
  Box3, Mesh, MeshStandardMaterial, SkinnedMesh, SphereGeometry, Vector3, type Object3D, type Skeleton,
} from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { aimDriverJoint, driverArm } from "./garageEmotes";
import { ROOK_ID, VILLAGER_ID, type CharacterLook } from "./characterCatalog";
import { addVillagerFaceShapes } from "./villagerFace";

export function villagerModelUrl(look: CharacterLook, kind: "garage" | "portrait" = "garage") {
  if (look.character.id === ROOK_ID) return kind === "portrait" ? __ROOK_PORTRAIT_URL__ : __ROOK_MODEL_URL__;
  if (look.character.id !== VILLAGER_ID) return null;
  return kind === "portrait" ? __VILLAGER_PORTRAIT_URL__ : __VILLAGER_MODEL_URL__;
}

export function prepareVillager(scene: Object3D, { female = true, animateFace = false } = {}) {
  const root = clone(scene);
  root.name = female ? "garage-villager-female" : "garage-villager-male";
  const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const accentMaterials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const skeletons = new Set<Skeleton>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
    const palette = /^(ACC_BOW|ACC_BELT)/.test(object.name) ? accentMaterials : materials;
    const owned = (material: MeshStandardMaterial) => {
      const existing = palette.get(material);
      if (existing) return existing;
      const copy = material.clone();
      palette.set(material, copy);
      return copy;
    };
    object.material = Array.isArray(object.material) ? object.material.map(owned) : owned(object.material);
    // The authored culling bounds describe the original rest pose.
    object.frustumCulled = false;
  });
  const faceGeometry = animateFace && female ? addVillagerFaceShapes(root) : [];
  for (const side of ["l", "r"] as const) {
    const joints = driverArm(root, side);
    if (!joints) continue;
    const { shoulder, elbow, hand } = joints;
    const sideSign = Math.sign(elbow.getWorldPosition(new Vector3()).x - shoulder.getWorldPosition(new Vector3()).x);
    aimDriverJoint(shoulder, elbow, new Vector3(sideSign * .43, -1, -.06));
    aimDriverJoint(elbow, hand, side === "r" ? new Vector3(-sideSign * .62, .36, .72) : new Vector3(sideSign * .32, -.73, .64));
  }

  // The face mesh stops at the hairline. This opaque short-hair cap follows the
  // head bone and sits below the authored bonnet, which covers the open scalp.
  const crop = female ? new Mesh(
    new SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * .52),
    new MeshStandardMaterial({ roughness: .97 }),
  ) : null;
  if (crop) {
    crop.name = "villager-short-hair";
    crop.position.set(0, 1.584, .018);
    crop.scale.set(.082, .086, .095);
    root.add(crop);
    root.getObjectByName("head")?.attach(crop);
  }

  root.updateMatrixWorld(true);
  const shoes = root.getObjectByName(female ? "CLOTH_FEET_SHOES" : "CLOTH_FEET_BOOTS");
  if (shoes) root.position.y = -new Box3().setFromObject(shoes, true).min.y;
  return {
    root, materials, accentMaterials, crop,
    hat: root.getObjectByName("ACC_HAT"),
    longHair: root.getObjectByName("HAIR_HAIR20"),
    bow: root.getObjectByName("ACC_BOW"),
    dispose() {
      faceGeometry.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      accentMaterials.forEach(material => material.dispose());
      skeletons.forEach(skeleton => skeleton.dispose());
      crop?.geometry.dispose();
      crop?.material.dispose();
    },
  };
}

export function applyVillagerLook(model: ReturnType<typeof prepareVillager>, look: CharacterLook) {
  for (const [source, material] of [...model.materials, ...model.accentMaterials]) {
    material.color.copy(source.color);
    switch (material.name) {
      case "MAT_ClothUpper":
      case "MAT_ClothLower":
        if (look.appearance.color !== "original" || look.outfit.id === "shop-crew" || look.outfit.id === "race-crew") {
          material.color.set(look.fabric).lerp(source.color, look.appearance.color.startsWith("#") ? 0 : .45);
        }
        break;
      case "MAT_Hair":
      case "MAT_LashBrow":
        if (look.appearance.hair_color !== "original") material.color.set(look.hair).lerp(source.color, .18);
        break;
      case "MAT_SkinBody":
      case "MAT_SkinFace":
        if (look.appearance.skin !== "original") material.color.set(look.skin).lerp(source.color, .25);
        break;
    }
  }
  for (const [source, material] of model.accentMaterials) {
    const map = look.appearance.accent ? null : source.map;
    if (material.map !== map) {
      material.map = map;
      material.needsUpdate = true;
    }
    if (look.appearance.accent) material.color.set(look.trim);
  }
  const cropped = look.appearance.hair === "cropped";
  if (model.hat) model.hat.visible = true;
  if (model.longHair) model.longHair.visible = !cropped;
  if (model.bow) model.bow.visible = Boolean(look.appearance.accent) || look.outfit.id === "shop-crew";
  if (model.crop) {
    model.crop.visible = cropped;
    model.crop.material.color.set(look.hair);
  }
}
