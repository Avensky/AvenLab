import { Group, Mesh, SkinnedMesh, type Object3D, type Skeleton } from "three";
import { prepareWardrobeLining } from "./wardrobeLining";
import { bindWardrobeGarmentMesh } from "./wardrobeGarmentFit";
import { prepareWardrobe, type WardrobeChoice } from "./wardrobe";

export const FITTING_BODY_URL = "/models/characters/female/wardrobe/vesper-body.glb";

function bindCorsetPart(part: Object3D, skeleton: Skeleton): Object3D | undefined {
  if (part instanceof SkinnedMesh) return bindWardrobeGarmentMesh(part, skeleton);
  if (part instanceof Mesh) return;
  const group = part.clone(false);
  for (const child of part.children) {
    const fitted = bindCorsetPart(child, skeleton);
    if (fitted) group.add(fitted);
  }
  return group.children.length ? group : undefined;
}

export type StandaloneCorsetSource = { set: string; scene: Object3D };

/** Bind the two authored fits and reuse their style-specific garment fitting on the live actor. */
export function prepareStandaloneCorset(source: StandaloneCorsetSource, skeleton: Skeleton, fullBody: Object3D | undefined) {
  if (!(fullBody instanceof SkinnedMesh)) return;
  const tuckedSource = source.scene.getObjectByName("CLOTH_CORSET_TUCKED");
  const overSource = source.scene.getObjectByName("CLOTH_CORSET_OVER");
  if (!tuckedSource || !overSource) return;
  const tucked = bindCorsetPart(tuckedSource, skeleton);
  const over = bindCorsetPart(overSource, skeleton);
  const body = bindWardrobeGarmentMesh(fullBody, skeleton);
  if (!tucked || !over || !body) return;

  const group = new Group();
  group.name = `wardrobe-corset-${source.set}`;
  group.add(tucked, over, body);
  const disposeFit = prepareWardrobeLining(group);
  body.removeFromParent();
  const wardrobe = prepareWardrobe(group);
  return {
    group,
    apply(waist: WardrobeChoice["waist"]) {
      wardrobe.apply({ set: source.set, shirt: "none", waist });
    },
    dispose() {
      group.removeFromParent();
      wardrobe.dispose();
      disposeFit?.();
    },
  };
}

export type StandaloneCorset = NonNullable<ReturnType<typeof prepareStandaloneCorset>>;
