import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Mesh, MeshStandardMaterial, Vector3, type Group, type Object3D } from "three";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";

import type { PieceColors } from "./clothingPieces";

function BagFallback({ colors }: { colors?: PieceColors }) {
  return <>
    <mesh position={[0, -.165, 0]}>
      <boxGeometry args={[.29, .19, .12]} />
      <meshStandardMaterial color={colors?.color ?? "#544c62"} roughness={.92} />
    </mesh>
    <mesh position={[0, -.067, 0]} scale={[1, 1.3, 1]}>
      <torusGeometry args={[.052, .009, 5, 14]} />
      <meshStandardMaterial color={colors?.accent ?? "#9d8193"} roughness={.85} />
    </mesh>
  </>;
}

function BagModel({ url, colors }: { url: string; colors?: PieceColors }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const copy = scene.clone();
    const grip = copy.getObjectByName("Grip_Handle");
    if (grip) copy.position.sub(grip.getWorldPosition(new Vector3()));
    else copy.position.y -= .13;
    const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    copy.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const own = (source: MeshStandardMaterial) => { if (!materials.has(source)) materials.set(source, source.clone()); return materials.get(source)!; };
      object.material = Array.isArray(object.material) ? object.material.map(own) : own(object.material);
    });
    return { root: copy, materials };
  }, [scene]);
  useEffect(() => () => model.materials.forEach(material => material.dispose()), [model]);
  useLayoutEffect(() => { model.materials.forEach((material, source) => {
    const color = /handle|strap|trim|metal/i.test(source.name) ? colors?.accent ?? colors?.color : colors?.color;
    material.color.copy(source.color); if (color) material.color.set(color);
  }); }, [model, colors]);
  return <primitive object={model.root} dispose={null} />;
}

export function DriverBag({ driver, colors }: { driver: Object3D; colors?: PieceColors }) {
  const hand = driver.getObjectByName("middle_01_l") ?? driver.getObjectByName("hand_l");
  const holder = useRef<Group>(null);
  const position = useMemo(() => new Vector3(), []);
  useFrame(() => {
    if (hand && holder.current?.parent) {
      hand.getWorldPosition(position);
      holder.current.position.copy(holder.current.parent.worldToLocal(position));
    }
  });
  if (!hand) return null;
  const fallback = <BagFallback colors={colors} />;
  return <group name="driver-shop-bag" ref={holder}>
    {__CHARACTER_BAG_URL__
      ? <AssetBoundary fallback={fallback}><Suspense fallback={fallback}><BagModel url={__CHARACTER_BAG_URL__} colors={colors} /></Suspense></AssetBoundary>
      : fallback}
  </group>;
}
