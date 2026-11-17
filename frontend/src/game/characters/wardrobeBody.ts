import { SkinnedMesh, type Object3D, type Skeleton } from "three";

export const WARDROBE_BODY_DONOR_URLS = [
  "/models/characters/female/wardrobe/vesper-body.glb",
  "/models/characters/wardrobe/gothic-02.mobile.glb",
] as const;

function isBoundSkin(body: Object3D | undefined): body is SkinnedMesh {
  return body instanceof SkinnedMesh && Boolean(body.skeleton?.bones.length);
}

export function getWardrobeActorBody(scene: Object3D) {
  const full = scene.getObjectByName("BODY_WARDROBE");
  if (isBoundSkin(full)) return full;
  const cut = scene.getObjectByName("BODY_OUTFIT_CUT");
  return isBoundSkin(cut) ? cut : undefined;
}

export function sharesWardrobeRig(source: SkinnedMesh, skeleton: Skeleton) {
  const bones = source.skeleton?.bones;
  return Boolean(bones?.length && bones.length === skeleton.bones.length
    && bones.every((bone, index) => bone.name === skeleton.bones[index].name));
}

export function isWardrobeBodyDonor(body: Object3D | undefined, skeleton: Skeleton): body is SkinnedMesh {
  if (!isBoundSkin(body)) return false;
  const { geometry } = body;
  const vertices = geometry.getAttribute("position")?.count ?? 0;
  return vertices >= 3 && (geometry.getIndex()?.count ?? 0) >= 3
    && geometry.getAttribute("skinIndex")?.count === vertices && geometry.getAttribute("skinWeight")?.count === vertices
    && sharesWardrobeRig(body, skeleton);
}

export function getWardrobeBodyDonor(scene: Object3D | null | undefined, skeleton: Skeleton) {
  const body = scene?.getObjectByName("BODY_WARDROBE");
  return isWardrobeBodyDonor(body, skeleton) ? body : undefined;
}
