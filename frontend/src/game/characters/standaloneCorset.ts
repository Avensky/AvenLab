import { Group, Mesh, SkinnedMesh, type Material, type Object3D, type Skeleton } from "three";
import { fitLacedBodiceToSkirt } from "./lacedStrapFit";
import { prepareWardrobeLining } from "./wardrobeLining";
import { bindWardrobeGarmentMesh } from "./wardrobeGarmentFit";
import { prepareWardrobe, UNDERBUST_WARDROBE_SET, type WardrobeChoice } from "./wardrobe";
import { fitUnderbustOverTop } from "./underbustFit";
import type { OverSkirtEase } from "./overSkirtEase";
import type { MeshBVH } from "three-mesh-bvh";

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

export function rebuiltUnderbustPart(scene: Object3D) {
  const part = scene.getObjectByName("UNDERBUST_SOURCE_REFIT");
  if (part?.userData.wardrobeRole !== "corset-over") return;
  let hasCloth = false;
  part.traverse(object => { hasCloth ||= object instanceof SkinnedMesh; });
  return hasCloth ? part : undefined;
}

/** Bind the loaded fits to the actor and retain the authored Over shell. */
export function prepareStandaloneCorset(source: StandaloneCorsetSource, skeleton: Skeleton, fullBody: Object3D | undefined) {
  if (!(fullBody instanceof SkinnedMesh)) return;
  const underbust = source.set === UNDERBUST_WARDROBE_SET;
  const rebuilt = underbust ? rebuiltUnderbustPart(source.scene) : undefined;
  const tuckedSource = source.scene.getObjectByName("CLOTH_CORSET_TUCKED");
  const overSource = rebuilt ?? source.scene.getObjectByName("CLOTH_CORSET_OVER");
  if (!overSource) return;
  const tucked = tuckedSource && bindCorsetPart(tuckedSource, skeleton);
  const over = bindCorsetPart(overSource, skeleton);
  const body = bindWardrobeGarmentMesh(fullBody, skeleton);
  if ((!rebuilt && !tucked) || !over || !body) return;

  const group = new Group();
  group.name = `wardrobe-corset-${source.set}`;
  const materials = new Map<Material, Material>();
  if (tucked) group.add(tucked);
  if (rebuilt) {
    const authored = new Group();
    authored.name = "CLOTH_CORSET_OVER";
    authored.userData.wardrobeRole = "corset-over";
    authored.add(over);
    group.add(authored);
    const withDyeChannel = (material: Material) => {
      let copy = materials.get(material);
      if (!copy) {
        copy = material.clone();
        copy.userData.color_slot = /^Material\d+$/.test(material.name) ? "hardware"
          : ["2_FRONT_1657", "5_FRONT_1672"].includes(material.name) ? "accent" : "fabric";
        materials.set(material, copy);
      }
      return copy;
    };
    over.traverse(mesh => {
      if (mesh instanceof SkinnedMesh) {
        mesh.userData.clothingPiece = "corset";
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(withDyeChannel) : withDyeChannel(mesh.material);
      }
    });
  } else {
    group.add(over, body);
  }
  const disposeFit = rebuilt ? undefined : prepareWardrobeLining(group);
  body.removeFromParent();
  const laced = source.set === "gothic-01";
  let wardrobe = underbust || laced ? undefined : prepareWardrobe(group);
  let disposeTopFit: (() => void) | undefined;
  let disposeSkirtFit: (() => void) | undefined;
  return {
    group,
    fitTop: underbust ? (tops: readonly MeshBVH[]) => {
      disposeTopFit = fitUnderbustOverTop(group, body.geometry, tops, { preserveNormals: Boolean(rebuilt) });
    } : undefined,
    fitSkirt: laced ? (skirts: readonly MeshBVH[]) => {
      disposeSkirtFit = fitLacedBodiceToSkirt(group, body.geometry, skirts);
    } : undefined,
    apply(waist: WardrobeChoice["waist"], ease: OverSkirtEase = 0) {
      wardrobe ??= prepareWardrobe(group);
      wardrobe.apply({ set: source.set, shirt: "none", waist }, ease);
    },
    dispose() {
      group.removeFromParent();
      wardrobe?.dispose();
      disposeTopFit?.();
      disposeSkirtFit?.();
      disposeFit?.();
      materials.forEach(material => material.dispose());
    },
  };
}

export type StandaloneCorset = NonNullable<ReturnType<typeof prepareStandaloneCorset>>;
