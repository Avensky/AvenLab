import { Suspense, useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Bone, Box3, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { characterLook, type CharacterChoice } from "./characterCatalog";
import { StylizedDriver } from "./StylizedDriver";

const villagerUrl = __VILLAGER_MODEL_URL__;
export type GarageDriverLook = NonNullable<ReturnType<typeof characterLook>>;

function VillagerDriver({ url, look }: { url: string; look: GarageDriverLook }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const root = clone(scene);
    root.name = "garage-villager-female";
    const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const owned = (material: MeshStandardMaterial) => {
        const existing = materials.get(material);
        if (existing) return existing;
        const copy = material.clone();
        materials.set(material, copy);
        return copy;
      };
      object.material = Array.isArray(object.material) ? object.material.map(owned) : owned(object.material);
      // The idle pose is outside the exported rest-pose culling bounds.
      object.frustumCulled = false;
    });
    for (const side of ["l", "r"]) {
      const shoulder = root.getObjectByName("upperarm_" + side);
      const elbow = root.getObjectByName("lowerarm_" + side);
      const hand = root.getObjectByName("hand_" + side);
      if (!(shoulder instanceof Bone && elbow instanceof Bone && hand instanceof Bone)) continue;
      const sign = Math.sign(elbow.getWorldPosition(new Vector3()).x - shoulder.getWorldPosition(new Vector3()).x);
      aim(shoulder, elbow, new Vector3(sign * .27, -1, -.12));
      aim(elbow, hand, side === "r" ? new Vector3(-sign * .7, .28, .5) : new Vector3(-sign * .13, -1, .3));
    }
    root.updateMatrixWorld(true);
    const shoes = root.getObjectByName("CLOTH_FEET_SHOES");
    if (shoes) root.position.y = -new Box3().setFromObject(shoes, true).min.y;
    return { root, materials };
  }, [scene]);
  useEffect(() => () => model.materials.forEach(material => material.dispose()), [model]);

  const cropped = look.appearance.hair === "cropped";
  const hat = look.appearance.headwear === "hat";
  useEffect(() => {
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
    for (const [part, visible] of [
      ["ACC_HAT", hat],
      ["HAIR_HAIR20", !cropped && !hat],
      ["ACC_BOW", look.outfit.id === "shop-crew"],
    ] as const) {
      const object = model.root.getObjectByName(part);
      if (object) object.visible = visible;
    }
  }, [model, look, cropped, hat]);
  return <>
    <primitive object={model.root} dispose={null} />
    {cropped && !hat && <mesh position={[0, 1.593, .018]} scale={[.079, .085, .093]}>
      <sphereGeometry args={[1, 20, 12, 0, Math.PI * 2, 0, Math.PI * .53]} />
      <meshStandardMaterial color={look.hair} roughness={.9} />
    </mesh>}
  </>;
}

function aim(bone: Bone, next: Bone, direction: Vector3) {
  const start = bone.getWorldPosition(new Vector3());
  const rest = next.getWorldPosition(new Vector3()).sub(start).normalize();
  const world = bone.getWorldQuaternion(new Quaternion());
  const parent = bone.parent!.getWorldQuaternion(new Quaternion()).invert();
  bone.quaternion.copy(parent.multiply(new Quaternion().setFromUnitVectors(rest, direction.normalize())).multiply(world));
  bone.updateWorldMatrix(false, true);
}

export function GarageDriver({ choice }: { choice: CharacterChoice }) {
  const look = useMemo(() => characterLook(choice), [choice]);
  if (!look) return null;
  const fallback = <StylizedDriver look={look} />;
  return (
    <group name="garage-driver" rotation={[-.095, -.16, -.045]}>
      {look.female && villagerUrl
        ? <AssetBoundary fallback={fallback}>
            <Suspense fallback={fallback}><VillagerDriver url={villagerUrl} look={look} /></Suspense>
          </AssetBoundary>
        : fallback}
    </group>
  );
}
