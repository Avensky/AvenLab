import {
  Bone, Box3, Mesh, MeshStandardMaterial, Quaternion, SkinnedMesh, SphereGeometry, Vector3, type Object3D, type Skeleton,
} from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { VILLAGER_ID, type CharacterLook } from "./characterCatalog";

export function villagerModelUrl(look: CharacterLook) {
  return look.character.id === VILLAGER_ID ? __VILLAGER_MODEL_URL__ : null;
}

function aim(bone: Bone, next: Bone, direction: Vector3) {
  const rest = next.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3())).normalize();
  const world = bone.getWorldQuaternion(new Quaternion());
  const parent = bone.parent!.getWorldQuaternion(new Quaternion()).invert();
  bone.quaternion.copy(parent.multiply(new Quaternion().setFromUnitVectors(rest, direction.normalize())).multiply(world));
  bone.updateWorldMatrix(false, true);
}

function arm(root: Object3D, side: "l" | "r") {
  const shoulder = root.getObjectByName("upperarm_" + side);
  const elbow = root.getObjectByName("lowerarm_" + side);
  const hand = root.getObjectByName("hand_" + side);
  if (!(shoulder instanceof Bone && elbow instanceof Bone && hand instanceof Bone)) return null;
  const sideSign = Math.sign(elbow.getWorldPosition(new Vector3()).x - shoulder.getWorldPosition(new Vector3()).x);
  return { shoulder, elbow, hand, sideSign };
}

export function prepareVillager(scene: Object3D) {
  const root = clone(scene);
  root.name = "garage-villager-female";
  const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const skeletons = new Set<Skeleton>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
    const owned = (material: MeshStandardMaterial) => {
      const existing = materials.get(material);
      if (existing) return existing;
      const copy = material.clone();
      materials.set(material, copy);
      return copy;
    };
    object.material = Array.isArray(object.material) ? object.material.map(owned) : owned(object.material);
    // The authored culling bounds describe the original rest pose.
    object.frustumCulled = false;
  });
  for (const side of ["l", "r"] as const) {
    const joints = arm(root, side);
    if (!joints) continue;
    const { shoulder, elbow, hand, sideSign } = joints;
    aim(shoulder, elbow, new Vector3(sideSign * .27, -1, -.12));
    aim(elbow, hand, side === "r" ? new Vector3(-sideSign * .7, .28, .5) : new Vector3(-sideSign * .13, -1, .3));
  }

  // The face mesh stops at the hairline. This opaque short-hair cap follows the
  // head bone and sits below the authored bonnet, which covers the open scalp.
  const crop = new Mesh(
    new SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * .52),
    new MeshStandardMaterial({ roughness: .97 }),
  );
  crop.name = "villager-short-hair";
  crop.position.set(0, 1.584, .018);
  crop.scale.set(.082, .086, .095);
  root.add(crop);
  root.getObjectByName("head")?.attach(crop);

  root.updateMatrixWorld(true);
  const shoes = root.getObjectByName("CLOTH_FEET_SHOES");
  if (shoes) root.position.y = -new Box3().setFromObject(shoes, true).min.y;
  return {
    root, materials, crop,
    hat: root.getObjectByName("ACC_HAT"),
    longHair: root.getObjectByName("HAIR_HAIR20"),
    bow: root.getObjectByName("ACC_BOW"),
    dispose() {
      materials.forEach(material => material.dispose());
      skeletons.forEach(skeleton => skeleton.dispose());
      crop.geometry.dispose();
      crop.material.dispose();
    },
  };
}

export function applyVillagerLook(model: ReturnType<typeof prepareVillager>, look: CharacterLook) {
  for (const [source, material] of model.materials) {
    material.color.copy(source.color);
    switch (material.name) {
      case "MAT_ClothUpper":
      case "MAT_ClothLower":
        if (look.appearance.color !== "original" || look.outfit.id === "shop-crew") {
          material.color.set(look.fabric).lerp(source.color, .45);
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
  const cropped = look.appearance.hair === "cropped";
  if (model.hat) model.hat.visible = true;
  if (model.longHair) model.longHair.visible = !cropped;
  if (model.bow) model.bow.visible = look.outfit.id === "shop-crew";
  model.crop.visible = cropped;
  model.crop.material.color.set(look.hair);
}

export function villagerIdlePose(root: Object3D) {
  const idle = ["lowerarm_l", "hand_l", "lowerarm_r", "hand_r", "head"].flatMap((name, index) => {
    const bone = root.getObjectByName(name);
    return bone instanceof Bone ? [{ bone, rest: bone.quaternion.clone(), phase: index * .8 }] : [];
  });
  const right = arm(root, "r");
  if (!right) return { idle, wave: [] };
  const { shoulder, elbow, hand, sideSign } = right;
  const shoulderRest = shoulder.quaternion.clone();
  const elbowRest = elbow.quaternion.clone();
  aim(shoulder, elbow, new Vector3(sideSign * .88, -.55, .28));
  aim(elbow, hand, new Vector3(sideSign * .24, 1, .28));
  const wave = [
    { bone: shoulder, rest: shoulderRest, target: shoulder.quaternion.clone() },
    { bone: elbow, rest: elbowRest, target: elbow.quaternion.clone() },
  ];
  for (const { bone, rest } of wave) bone.quaternion.copy(rest);
  root.updateMatrixWorld(true);
  return { idle, wave };
}
