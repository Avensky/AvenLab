import { Suspense, useEffect, useMemo } from "react";
import { Environment, Html, Lightformer, useGLTF } from "@react-three/drei";
import { createPortal } from "@react-three/fiber";
import { Box3, Group, Vector3 } from "three";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { Showroom, ShowroomFloor } from "./Showroom";
import { garagePlacement } from "./garagePlacement";
import { prepareGarageDisplay } from "./prepareGarageDisplay";
import { GarageGlow } from "./GarageGlow";
import { GarageFloorReflection } from "./GarageFloorReflection";

// Vite serves files in public/ at the URL root. Presentation fixes below are
// specific to Garage Special; keep the ship out of the car selection roster.
export const GARAGE_MODEL_PATH = "/models/world/garage_special.glb";
const GARAGE_DISPLAY_SCALE = 0.06;

export function GarageEnvironment({ turntable }: { turntable: Group | null }) {
  return <>
    <Showroom floor={false} />
    <GarageGlow />
    <AssetBoundary fallback={<>
      <ShowroomFloor />
      <Html fullscreen style={{ pointerEvents: "none" }}><p className="absolute left-2 top-14 text-[10px] text-amber-200">GARAGE UNAVAILABLE — USING SHOWROOM</p></Html>
    </>}>
      <Suspense fallback={<ShowroomFloor />}><GarageModel turntable={turntable} /></Suspense>
    </AssetBoundary>
  </>;
}

function GarageModel({ turntable }: { turntable: Group | null }) {
  const { scene } = useGLTF(GARAGE_MODEL_PATH, "/draco/");
  const prepared = useMemo(() => {
    const display = prepareGarageDisplay(scene);
    display.root.scale.multiplyScalar(GARAGE_DISPLAY_SCALE);
    display.root.position.add(new Vector3(...garagePlacement(display.root, "Plane_PISTE")));
    display.root.updateWorldMatrix(true, true);
    const platform = new Group(); platform.name = "garage-display-platform";
    const pad = display.root.getObjectByName("Plane_PISTE");
    const footprint = pad ? new Box3().setFromObject(pad, true).getSize(new Vector3()) : null;
    // Preserve the placed pad's world transform, including the source scale.
    for (const name of ["Plane_PISTE", "RB_Tour", "RB_Tour001", "RB_Tour.001"]) {
      const part = display.root.getObjectByName(name);
      if (part) platform.attach(part);
    }
    return { ...display, platform, footprint };
  }, [scene]);
  useEffect(() => () => prepared.dispose(), [prepared]);
  return <>
    <group name="garage-special-environment"><primitive object={prepared.root} dispose={null} /></group>
    {turntable && createPortal(<>
      <primitive object={prepared.platform} dispose={null} />
      {prepared.footprint && <GarageFloorReflection width={prepared.footprint.x} depth={prepared.footprint.z} />}
    </>, turntable)}
    {/* One small, generated reflection map. No HDRI fetch or per-frame cube capture. */}
    <Environment resolution={128} frames={1}>
      <Lightformer form="rect" intensity={1} position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[3, 8, 1]} />
      <Lightformer form="rect" color="#48ff18" intensity={1.3} position={[0, 3, -6]} scale={[10, 0.2, 1]} />
      <Lightformer form="rect" color="#d9ffe1" intensity={1} position={[-6, 3, 0]} rotation={[0, Math.PI / 2, 0]} scale={[8, 0.3, 1]} />
    </Environment>
  </>;
}
