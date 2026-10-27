import { Suspense, useEffect, useMemo } from "react";
import { Environment, Html, Lightformer, useGLTF } from "@react-three/drei";
import { createPortal } from "@react-three/fiber";
import { Box3, Group, InstancedMesh, Vector3 } from "three";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { Showroom, ShowroomFloor } from "./Showroom";
import { garagePlacement } from "./garagePlacement";
import { prepareGarageDisplay } from "./prepareGarageDisplay";
import { GarageGlow } from "./GarageGlow";
import { GarageFloorReflection } from "./GarageFloorReflection";
import { completeGarageStructure } from "./completeGarageStructure";

// Vite serves files in public/ at the URL root. Presentation fixes below are
// specific to Garage Special; keep the ship out of the car selection roster.
export const GARAGE_MODEL_PATH = "/models/world/garage_special.glb?v=complete-1";
const GARAGE_DISPLAY_SCALE = 0.06;
type GarageProps = { turntable: Group | null; onPlatformReady?: (footprint: [number, number]) => void };

export function GarageEnvironment({ turntable, onPlatformReady }: GarageProps) {
  return <>
    <Showroom floor={false} />
    <GarageGlow />
    <AssetBoundary fallback={<>
      <ShowroomFloor />
      <Html fullscreen style={{ pointerEvents: "none" }}><p className="absolute left-2 top-14 text-[10px] text-amber-200">GARAGE UNAVAILABLE — USING SHOWROOM</p></Html>
    </>}>
      <Suspense fallback={<ShowroomFloor />}><GarageModel turntable={turntable} onPlatformReady={onPlatformReady} /></Suspense>
    </AssetBoundary>
  </>;
}

function GarageModel({ turntable, onPlatformReady }: GarageProps) {
  const { scene } = useGLTF(GARAGE_MODEL_PATH, "/draco/");
  const prepared = useMemo(() => {
    const display = prepareGarageDisplay(scene);
    display.root.scale.multiplyScalar(GARAGE_DISPLAY_SCALE);
    display.root.position.add(new Vector3(...garagePlacement(display.root, "Plane_PISTE")));
    display.root.updateWorldMatrix(true, true);
    const platform = new Group(); platform.name = "garage-display-platform";
    const pad = display.root.getObjectByName("Plane_PISTE");
    const footprint = pad ? new Box3().setFromObject(pad, true).getSize(new Vector3()) : null;
    // The reflective tile shader already draws this surface. Keep the full
    // grid in the exported asset, but avoid drawing 47k covered triangles here.
    if (display.root.userData.avenlabGarageComplete === true) {
      const coveredTiles = display.root.getObjectByName("Sol_CUBE");
      if (coveredTiles) coveredTiles.visible = false;
    }
    // Preserve the placed pad's world transform, including the source scale.
    for (const name of ["Plane_PISTE", "RB_Tour", "RB_Tour001", "RB_Tour.001"]) {
      const part = display.root.getObjectByName(name);
      if (part) platform.attach(part);
    }
    const completed = completeGarageStructure(display.root);
    // The full-plane tile overlay covers the original grey floor edging.
    // Follow the authored wall frame when restoring that perimeter finish.
    const wallFrame = display.root.getObjectByName("SEMI_Murs");
    const perimeter = wallFrame ? new Box3().setFromObject(wallFrame, true) : null;
    // A static copy in the environment probe gives glossy walls the actual
    // ceiling fixtures, alongside neutral studio highlights.
    const probeRoot = new Group(); probeRoot.add(display.root.clone(true), completed.structure.clone(true));
    return { ...display, platform, footprint, perimeter, probeRoot, structure: completed.structure, dispose: () => {
      probeRoot.traverse(object => { if (object instanceof InstancedMesh) object.dispose(); });
      completed.dispose(); display.dispose();
    } };
  }, [scene]);
  useEffect(() => () => prepared.dispose(), [prepared]);
  const footprint = prepared.footprint;
  useEffect(() => { if (footprint) onPlatformReady?.([footprint.x, footprint.z]); }, [footprint, onPlatformReady]);
  return <>
    <group name="garage-special-environment"><primitive object={prepared.root} dispose={null} /><primitive object={prepared.structure} dispose={null} /></group>
    {turntable && createPortal(<>
      <primitive object={prepared.platform} dispose={null} />
    </>, turntable)}
    {footprint && <GarageFloorReflection width={footprint.x} depth={footprint.z} turntable={turntable} perimeter={prepared.perimeter} />}
    {/* One small, generated reflection map. No HDRI fetch or per-frame cube capture. */}
    <Environment resolution={128} frames={1}>
      <group position={[0, -2.2, 0]}>
        <primitive object={prepared.probeRoot} dispose={null} />
        <hemisphereLight args={["#e2e6ed", "#242936", 0.65]} />
        <directionalLight position={[-6, 8, -4]} color="#f0f4ff" intensity={1} />
      </group>
      <Lightformer form="rect" intensity={1} position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[3, 8, 1]} />
      <Lightformer form="rect" color="#d8e2f0" intensity={0.35} position={[0, 3, -6]} scale={[8, 0.1, 1]} />
      <Lightformer form="rect" color="#e9eef5" intensity={0.65} position={[-6, 3, 0]} rotation={[0, Math.PI / 2, 0]} scale={[8, 0.2, 1]} />
    </Environment>
  </>;
}
