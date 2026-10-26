import { Suspense, useEffect, useMemo } from "react";
import { Html, useGLTF } from "@react-three/drei";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { CarrierPlaceholder } from "../../world/props/CarrierPlaceholder";
import { prepareCityShowcase } from "./prepareCityShowcase";

// Standalone display stage, not a spawned/streamed gameplay map. These are the
// same exported transforms as streaming_endless_city_colliders.json. Moving
// both visuals down by road_y places the preview car's tires at display Y=0.
const roadY = 0.32;

export function CityShowcase() {
  return <>
    <color attach="background" args={["#243b50"]} />
    <fog attach="fog" args={["#243b50", 180, 650]} />
    <group name="selection-city-showcase">
    <hemisphereLight args={["#c2e0ff", "#525253", 1.6]} />
    <directionalLight position={[-60, 90, -30]} color="#ffe2be" intensity={2.6} />
    <directionalLight position={[70, 50, 80]} color="#8fc9ff" intensity={1} />
    {/* A single 2x2 chunk: no city streaming, players or server connection. */}
    <AssetBoundary fallback={<SimplifiedCity unavailable />}>
      <Suspense fallback={<SimplifiedCity />}>
        <PreviewCityAsset path="/models/chuncks/chunck_0,0_2x2_blocks_centered.glb" position={[0, -roadY, 0]} />
      </Suspense>
    </AssetBoundary>
    <AssetBoundary fallback={null}>
      <Suspense fallback={null}>
        <PreviewCityAsset path="/models/chuncks/chunck_0,0_2x2_roads.glb" position={[0, 1.445989914 - roadY, 0]} />
      </Suspense>
    </AssetBoundary>
    {/* Quayside base remains visible if either GLB is still downloading. */}
    <mesh position={[0, -1.1, 0]}><boxGeometry args={[282, 2, 460]} /><meshStandardMaterial color="#3b444c" roughness={1} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[230, -2.3, 0]}><planeGeometry args={[1200, 1200]} /><meshStandardMaterial color="#16475e" metalness={0.25} roughness={0.55} /></mesh>
    {Array.from({ length: 9 }, (_, index) => <mesh key={index} position={[137, 0.4, index * 44 - 176]}>
      <cylinderGeometry args={[0.6, 0.8, 1.2, 6]} /><meshStandardMaterial color="#ba9550" roughness={0.9} />
    </mesh>)}
    <CarrierPlaceholder />
    </group>
  </>;
}

function PreviewCityAsset({ path, position }: { path: string; position: [number, number, number] }) {
  const { scene } = useGLTF(path);
  const prepared = useMemo(() => prepareCityShowcase(scene), [scene]);
  useEffect(() => () => prepared.dispose(), [prepared]);
  return <group name={`city-asset-${path}`} position={position}><primitive object={prepared.root} dispose={null} /></group>;
}

function SimplifiedCity({ unavailable = false }: { unavailable?: boolean }) {
  return <group name="selection-city-fallback">
    {[-1, 1].flatMap(x => [-1, 1].flatMap(z => [0, 1, 2, 3].map(index => <mesh key={`${x},${z},${index}`}
      position={[x * (30 + index % 2 * 38), 12 + index * 7, z * (40 + Math.floor(index / 2) * 72)]}>
      <boxGeometry args={[22, 24 + index * 14, 30]} /><meshStandardMaterial color={index % 2 ? "#637482" : "#78818a"} roughness={1} />
    </mesh>)))}
    {unavailable && <Html fullscreen style={{ pointerEvents: "none" }}><p className="absolute left-2 top-16 text-[10px] text-amber-200">CITY MODEL UNAVAILABLE — SIMPLIFIED PREVIEW</p></Html>}
  </group>;
}
