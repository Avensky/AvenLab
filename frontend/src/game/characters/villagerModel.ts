import {
  Box3, MathUtils, Mesh, MeshStandardMaterial, SkinnedMesh, SphereGeometry, Vector3, type Object3D, type Skeleton,
} from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { aimDriverJoint, driverArm } from "./garageEmotes";
import { ROOK_ID, VILLAGER_ID, type CharacterLook } from "./characterCatalog";
import { addVillagerFaceShapes, prepareVillagerFaceColors } from "./villagerFace";
import { prepareVillagerFaceAccessories } from "./villagerFaceAccessories";
import { cockpitWardrobe } from "./cockpitWardrobe";
import { clothingColors, clothingPieceFor, type ClothingPiece } from "./clothingPieces";
import { prepareWardrobe, wardrobeModelUrl } from "./wardrobe";
import { prepareWardrobeLining } from "./wardrobeLining";
import { prepareWardrobeSkirt } from "./wardrobeSkirt";
import { prepareVillageShoes } from "./wardrobeShoes";
import { prepareWardrobeGarments, type WardrobeGarmentSource } from "./wardrobeGarmentFit";

export function villagerModelUrl(look: CharacterLook, kind: "garage" | "portrait" = "garage") {
  if (look.character.id === ROOK_ID) return kind === "portrait" ? __ROOK_PORTRAIT_URL__ : __ROOK_MODEL_URL__;
  if (look.character.id !== VILLAGER_ID) return null;
  const wardrobeUrl = wardrobeModelUrl(look.wardrobe, kind);
  if (wardrobeUrl) return wardrobeUrl;
  return kind === "portrait" ? __VILLAGER_PORTRAIT_URL__ : __VILLAGER_MODEL_URL__;
}

export function prepareVillager(scene: Object3D, { female = true, animateFace = false, bag = false, wetEyes = false, fitted = false,
  garments = [], garmentBody,
}: { female?: boolean; animateFace?: boolean; bag?: boolean; wetEyes?: boolean; fitted?: boolean;
  garments?: WardrobeGarmentSource[]; garmentBody?: Object3D;
} = {}) {
  const root = clone(scene);
  root.name = female ? "garage-villager-female" : "garage-villager-male";
  const disposeLining = prepareWardrobeLining(root);
  const disposeSkirt = prepareWardrobeSkirt(root);
  const disposeShoes = female ? prepareVillageShoes(root) : undefined;
  const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const pieceMaterials = new Map<ClothingPiece, Map<MeshStandardMaterial, MeshStandardMaterial>>();
  root.userData.fittedClothing = fitted;
  root.updateMatrixWorld(true);
  const vertex = new Vector3();
  let skirtRadius: number | undefined;
  const skeletons = new Set<Skeleton>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
    const piece = clothingPieceFor(object);
    if (piece) { object.userData.clothingPiece = piece; if (!pieceMaterials.has(piece)) pieceMaterials.set(piece, new Map()); }
    if (piece === "skirt" || piece === "underskirt") {
      skirtRadius ??= 0;
      // Measure at the relaxed hands, where the full hem width is irrelevant.
      const position = object.geometry.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
        if (vertex.y > .73 && vertex.y < 1.04) skirtRadius = Math.max(skirtRadius, Math.abs(vertex.x));
      }
    }
    const owned = (material: MeshStandardMaterial) => {
      const palette = piece && !/Skin|Hair|Lash|Cornea/.test(material.name) ? pieceMaterials.get(piece)! : materials;
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
  const skirtRoom = skirtRadius === undefined ? undefined : MathUtils.clamp(skirtRadius - .23, 0, .12);
  root.userData.skirtHandRoom = skirtRoom;
  const faceGeometry = animateFace ? addVillagerFaceShapes(root, female) : [];
  const wardrobe = prepareWardrobe(root);
  const trialGarments = female ? prepareWardrobeGarments(root, garments, scene.getObjectByName("BODY_WARDROBE") ?? garmentBody) : undefined;
  const applyFaceColors = prepareVillagerFaceColors(materials.values(), female);
  const faceAccessories = prepareVillagerFaceAccessories(root, female, wetEyes);
  for (const side of ["l", "r"] as const) {
    const joints = driverArm(root, side);
    if (!joints) continue;
    const { shoulder, elbow, hand } = joints;
    const sideSign = Math.sign(elbow.getWorldPosition(new Vector3()).x - shoulder.getWorldPosition(new Vector3()).x);
    const fittedRest = fitted && !(side === "l" && bag);
    const handRoom: number | undefined = root.userData.skirtHandRoom;
    const skirtRest = handRoom !== undefined && !(side === "l" && bag);
    const elbowSpread = fittedRest ? .12 : fitted ? .20 : .43;
    aimDriverJoint(shoulder, elbow, new Vector3(sideSign * elbowSpread, -1, -.06));
    // Keep the shoulder pose and open the forearm just enough to clear the skirt.
    const forearm = skirtRest ? new Vector3(sideSign * ((fittedRest ? .64 : .29) + 4 * handRoom), -.96, .32 + handRoom)
      : fittedRest ? new Vector3(sideSign * .035, -.96, .25) : side === "r" ? new Vector3(-sideSign * .62, .36, .72)
      : female && !bag ? new Vector3(sideSign * .12, -.83, .56)
        : new Vector3(sideSign * .32, -.73, .64);
    aimDriverJoint(elbow, hand, forearm);
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

  cockpitWardrobe(root);
  root.updateMatrixWorld(true);
  const shoes = root.getObjectByName(female ? "CLOTH_FEET_SHOES" : "CLOTH_FEET_BOOTS");
  if (shoes) root.position.y = -new Box3().setFromObject(shoes, true).min.y;
  return {
    root, materials, pieceMaterials, crop, applyFaceColors, faceAccessories, wardrobe, trialGarments,
    hat: root.getObjectByName("ACC_HAT"),
    longHair: root.getObjectByName("HAIR_HAIR20"),
    bow: root.getObjectByName("ACC_BOW"),
    dispose() {
      trialGarments?.dispose();
      wardrobe.dispose();
      disposeLining?.();
      disposeSkirt?.();
      disposeShoes?.();
      faceGeometry.forEach(geometry => geometry.dispose());
      faceAccessories.dispose();
      materials.forEach(material => material.dispose());
      pieceMaterials.forEach(palette => palette.forEach(material => material.dispose()));
      skeletons.forEach(skeleton => skeleton.dispose());
      crop?.geometry.dispose();
      crop?.material.dispose();
    },
  };
}

export function applyVillagerLook(model: ReturnType<typeof prepareVillager>, look: CharacterLook) {
  model.wardrobe.apply(look.wardrobe);
  model.applyFaceColors(look);
  model.faceAccessories.setGlasses(look.appearance.glasses);
  model.faceAccessories.setColors(clothingColors(look, "glasses"));
  for (const [source, material] of [...model.materials, ...[...model.pieceMaterials.values()].flatMap(palette => [...palette])]) {
    material.color.copy(source.color);
    const slot = source.userData.color_slot;
    if (slot === "fabric" && look.appearance.color !== "original") material.color.set(look.fabric);
    if (slot === "accent" && look.appearance.accent) material.color.set(look.trim);
    switch (material.name) {
      case "MAT_ClothUpper":
      case "MAT_ClothLower":
        if (look.appearance.color !== "original" || look.outfit.id === "shop-crew" || look.outfit.id === "race-crew") {
          const tint = material.color.set(look.fabric);
          if (!look.appearance.color.startsWith("#")) {
            // Keep a trace of the source on lighter dyes without washing out deep shades.
            tint.lerp(source.color, .32 * Math.max(tint.r, tint.g, tint.b));
          }
        }
        material.color.multiplyScalar(.74);
        material.roughness = Math.max(source.roughness, .82);
        material.metalness = Math.min(source.metalness, .2);
        break;
      case "MAT_Hair":
      case "MAT_LashBrow":
        if (look.appearance.hair_color !== "original") {
          const tint = material.color.set(look.hair);
          tint.lerp(source.color, .22 * Math.max(tint.r, tint.g, tint.b));
        }
        break;
      case "MAT_SkinBody":
      case "MAT_SkinFace":
        if (look.appearance.skin !== "original") material.color.set(look.skin).lerp(source.color, .25);
        break;
    }
  }
  for (const [source, material] of [...(model.pieceMaterials.get("bow") ?? []), ...(model.pieceMaterials.get("belt") ?? [])]) {
    const map = look.appearance.accent ? null : source.map;
    if (material.map !== map) {
      material.map = map;
      material.needsUpdate = true;
    }
    if (look.appearance.accent) material.color.set(look.trim);
  }
  for (const [piece, palette] of model.pieceMaterials) {
    const colors = clothingColors(look, piece);
    for (const [source, material] of palette) {
      const accent = source.userData.color_slot === "accent" || source.userData.color_slot === "hardware" || /Details/.test(source.name);
      const color = accent ? colors?.accent ?? colors?.color : colors?.color;
      if (color) material.color.set(color);
    }
  }
  const cropped = look.appearance.hair === "cropped";
  if (model.hat) model.hat.visible = true;
  if (model.longHair) model.longHair.visible = !cropped;
  if (model.bow) model.bow.visible = Boolean(look.appearance.accent) || look.outfit.id === "shop-crew";
  if (model.crop) {
    model.crop.visible = cropped;
    model.crop.material.color.set(look.hair);
  }
  model.trialGarments?.apply(look);
}
