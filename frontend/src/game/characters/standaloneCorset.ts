import { Group, Matrix4, Mesh, SkinnedMesh, type Material, type Object3D, type Skeleton } from "three";
import { fitLacedBodiceToSkirt } from "./lacedStrapFit";
import { prepareHighCollarShoulders } from "./highCollarShoulders";
import { fitHighCollarBust } from "./highCollarBust";
import { prepareWardrobeLining } from "./wardrobeLining";
import { bindWardrobeGarmentMesh } from "./wardrobeGarmentFit";
import { LACED_BODICE_WARDROBE_SET, prepareWardrobe, UNDERBUST_WARDROBE_SET, type WardrobeChoice } from "./wardrobe";
import { tagRebuiltUnderbustMaterial } from "./rebuiltUnderbustDye";
import { hasAuthoredSweetheartFit } from "./sweetheartCorset";
import type { OverSkirtEase } from "./overSkirtEase";
import type { MeshBVH } from "three-mesh-bvh";
import { sharesWardrobeRig } from "./wardrobeBody";

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

export function rebuiltUnderbustPart(scene: Object3D, waist?: WardrobeChoice["waist"]) {
  const part = scene.getObjectByName("UNDERBUST_SOURCE_REFIT");
  const role = part?.userData.wardrobeRole;
  if (!part || (role !== "corset-over" && role !== "corset-tucked") || (waist && role !== `corset-${waist}`)) return;
  let hasCloth = false;
  part.traverse(object => { hasCloth ||= object instanceof SkinnedMesh; });
  return hasCloth ? part : undefined;
}

export function hasAuthoredLacedBodiceFit(scene: Object3D) {
  return (["over", "tucked"] as const).every(waist => {
    const part = scene.getObjectByName(`CLOTH_CORSET_${waist.toUpperCase()}`);
    if (part?.userData.authoredFit !== true || part.userData.wardrobeRole !== `corset-${waist}`) return false;
    let hasCloth = false;
    part.traverse(object => { hasCloth ||= object instanceof SkinnedMesh; });
    return hasCloth;
  });
}

function corsetFitParts({ scene, set }: StandaloneCorsetSource) {
  const rebuilt = set === UNDERBUST_WARDROBE_SET ? rebuiltUnderbustPart(scene) : undefined;
  const tucked = !rebuilt ? scene.getObjectByName("CLOTH_CORSET_TUCKED") : undefined;
  const over = !rebuilt ? scene.getObjectByName("CLOTH_CORSET_OVER") : undefined;
  return { rebuilt, tucked, over };
}

function hasBindableCorsetPart(part: Object3D, skeleton: Skeleton): boolean {
  if (part instanceof SkinnedMesh) return sharesWardrobeRig(part, skeleton);
  return !(part instanceof Mesh) && part.children.some(child => hasBindableCorsetPart(child, skeleton));
}

export function hasBindableStandaloneCorset(source: StandaloneCorsetSource, skeleton: Skeleton) {
  const { rebuilt, tucked, over } = corsetFitParts(source);
  if (rebuilt) return hasBindableCorsetPart(rebuilt, skeleton);
  return Boolean(tucked && over && hasBindableCorsetPart(tucked, skeleton) && hasBindableCorsetPart(over, skeleton));
}

/** Bind the loaded fit to the actor. */
export function prepareStandaloneCorset(source: StandaloneCorsetSource, skeleton: Skeleton, fullBody: Object3D | undefined) {
  if (!(fullBody instanceof SkinnedMesh)) return;
  const underbust = source.set === UNDERBUST_WARDROBE_SET;
  const laced = source.set === LACED_BODICE_WARDROBE_SET;
  const authoredLacedBodice = laced && hasAuthoredLacedBodiceFit(source.scene);
  const sweetheartSkin = hasAuthoredSweetheartFit(source.scene, 2);
  const { rebuilt, tucked: tuckedSource, over: overSource } = corsetFitParts(source);
  const authoredHighCollar = source.set === "gothic-05" && tuckedSource?.userData.authoredHighCollarFit === 1
    && overSource?.userData.authoredHighCollarFit === 1;
  const body = bindWardrobeGarmentMesh(fullBody, skeleton);
  if (!body) return;

  const group = new Group();
  group.name = `wardrobe-corset-${source.set}`;
  const materials = new Map<Material, Material>();
  const tuckedHardware: SkinnedMesh[] = [];
  if (rebuilt) {
    const cloth = bindCorsetPart(rebuilt, skeleton);
    if (!cloth) return;
    const role = rebuilt.userData.wardrobeRole;
    const authored = new Group();
    authored.name = role === "corset-tucked" ? "CLOTH_CORSET_TUCKED" : "CLOTH_CORSET_OVER";
    authored.userData.wardrobeRole = role;
    authored.add(cloth);
    group.add(authored);
    const withDyeChannel = (material: Material) => {
      let copy = materials.get(material);
      if (!copy) {
        copy = material.clone();
        tagRebuiltUnderbustMaterial(copy);
        materials.set(material, copy);
      }
      return copy;
    };
    cloth.traverse(mesh => {
      if (mesh instanceof SkinnedMesh) {
        mesh.userData.clothingPiece = "corset";
        mesh.userData.rebuiltUnderbust = true;
        if (role === "corset-tucked" && !Array.isArray(mesh.material) && mesh.material.userData.tuckedLowerHardware) {
          tuckedHardware.push(mesh);
        }
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(withDyeChannel) : withDyeChannel(mesh.material);
      }
    });
  } else {
    const tucked = tuckedSource && bindCorsetPart(tuckedSource, skeleton);
    const over = overSource && bindCorsetPart(overSource, skeleton);
    if (!tucked || !over) return;
    if (authoredHighCollar) {
      for (const fit of [tucked, over]) fit.traverse(mesh => {
        if (mesh instanceof SkinnedMesh) mesh.geometry = fitHighCollarBust(mesh.geometry);
      });
    }
    group.add(tucked, over, body);
  }
  const updateShoulders = authoredHighCollar ? prepareHighCollarShoulders(group, skeleton) : undefined;
  const disposeFit = rebuilt || authoredLacedBodice || updateShoulders ? undefined : prepareWardrobeLining(group);
  // The authored straps benefit from the same conservative skin coverage as the legacy fit.
  if (authoredLacedBodice) group.userData.lacedBodiceStraps = true;
  body.removeFromParent();
  let wardrobe = underbust || laced ? undefined : prepareWardrobe(group);
  let disposeSkirtFit: (() => void) | undefined;
  return {
    group,
    underbust,
    authoredLacedBodice,
    sweetheartSkin,
    updateShoulders,
    villageWaistSource: authoredLacedBodice || sweetheartSkin ? source.scene : undefined,
    fitSkirt: laced || sweetheartSkin ? (skirts: readonly MeshBVH[], village?: { hasBelt: boolean }, reuse?: { adjustments?: Float32Array }) => {
      disposeSkirtFit = fitLacedBodiceToSkirt(group, body.geometry, skirts, village, reuse);
    } : undefined,
    fitTuckedHardware: tuckedHardware.length ? (skirts: readonly MeshBVH[]) => {
      // Imported garments share the actor's bind space. Hide only fasteners
      // that would break through a selected skirt's fabric.
      const sharedBindSpace = new Matrix4();
      for (const mesh of tuckedHardware) {
        mesh.visible = !skirts.some(skirt => skirt.intersectsGeometry(mesh.geometry, sharedBindSpace));
      }
    } : undefined,
    apply(waist: WardrobeChoice["waist"], ease: OverSkirtEase = 0) {
      wardrobe ??= prepareWardrobe(group);
      wardrobe.apply({ set: source.set, shirt: "none", waist }, ease);
    },
    dispose() {
      group.removeFromParent();
      wardrobe?.dispose();
      disposeSkirtFit?.();
      disposeFit?.();
      materials.forEach(material => material.dispose());
    },
  };
}

export type StandaloneCorset = NonNullable<ReturnType<typeof prepareStandaloneCorset>>;
