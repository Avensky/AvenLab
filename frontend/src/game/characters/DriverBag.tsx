import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import { Vector3, type Group, type Object3D } from "three";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";

function BagFallback() {
  return <>
    <mesh position={[0, -.165, 0]}>
      <boxGeometry args={[.29, .19, .12]} />
      <meshStandardMaterial color="#544c62" roughness={.92} />
    </mesh>
    <mesh position={[0, -.067, 0]} scale={[1, 1.3, 1]}>
      <torusGeometry args={[.052, .009, 5, 14]} />
      <meshStandardMaterial color="#9d8193" roughness={.85} />
    </mesh>
  </>;
}

function BagModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const copy = scene.clone();
    const grip = copy.getObjectByName("Grip_Handle");
    if (grip) copy.position.sub(grip.getWorldPosition(new Vector3()));
    else copy.position.y -= .13;
    return copy;
  }, [scene]);
  return <primitive object={model} dispose={null} />;
}

export function DriverBag({ driver }: { driver: Object3D }) {
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
  const fallback = <BagFallback />;
  return <group name="driver-shop-bag" ref={holder}>
    {__CHARACTER_BAG_URL__
      ? <AssetBoundary fallback={fallback}><Suspense fallback={fallback}><BagModel url={__CHARACTER_BAG_URL__} /></Suspense></AssetBoundary>
      : fallback}
  </group>;
}
