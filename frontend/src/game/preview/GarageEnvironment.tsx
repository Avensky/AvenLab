import { Suspense, useMemo } from "react";
import { Html, useGLTF } from "@react-three/drei";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { Showroom, ShowroomFloor } from "./Showroom";
import { garagePlacement } from "./garagePlacement";

// Vite serves files in public/ at the URL root. Change only this configuration
// when trying garage.glb; keep the ship out of the car selection roster.
export const GARAGE_MODEL_PATH = "/models/world/garage_special.glb";
const GARAGE_DISPLAY_SCALE = 0.16;

export function GarageEnvironment() {
  return <>
    <Showroom floor={false} />
    <AssetBoundary fallback={<>
      <ShowroomFloor />
      <Html fullscreen style={{ pointerEvents: "none" }}><p className="absolute left-2 top-14 text-[10px] text-amber-200">GARAGE UNAVAILABLE — USING SHOWROOM</p></Html>
    </>}>
      <Suspense fallback={<ShowroomFloor />}><GarageModel /></Suspense>
    </AssetBoundary>
  </>;
}

function GarageModel() {
  const { scene } = useGLTF(GARAGE_MODEL_PATH, "/draco/");
  const root = useMemo(() => {
    const copy = scene.clone(true);
    // This asset includes its own oversized demo car. Hide the display copy
    // before placing our selected vehicle; never edit the cached GLB scene.
    for (const child of [...copy.children]) {
      const name = String(child.userData.name ?? child.name).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (name === "lambotm") child.removeFromParent();
    }
    copy.scale.multiplyScalar(GARAGE_DISPLAY_SCALE);
    return copy;
  }, [scene]);
  const position = useMemo(() => garagePlacement(root, "Plane_PISTE"), [root]);
  return <group name="garage-special-environment" position={position}><primitive object={root} dispose={null} /></group>;
}
