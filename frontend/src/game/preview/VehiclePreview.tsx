import { Suspense } from "react";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { useRenderSettingsStore } from "../../store/renderSettingsStore";
import {
  Environment,
  Html,
  Grid,
  OrbitControls,
  PerspectiveCamera,
} from "@react-three/drei";

import { useSelectionStore } from "../../store/selectionStore";
import { VehiclePreviewModel } from "./VehiclePreviewModel";
import { VehicleRotatingCamera } from "../../effects/VehicleRotatingCamera";

export function VehiclePreview() {
  const vehicleId = useSelectionStore((s) => s.getSelectedVehicle().id);
  const reflections = useRenderSettingsStore((s) => s.reflections);
  return (
    <>
      <color attach="background" args={["#020617"]} />

      <PerspectiveCamera makeDefault fov={55} position={[0, 2.2, 7]} />

      <ambientLight intensity={1.2} />
      <directionalLight position={[5, 8, 5]} intensity={2.4} />
      <directionalLight position={[-5, 4, -5]} intensity={0.8} />

      <AssetBoundary key={vehicleId} fallback={<Html center><p className="rounded bg-slate-950 p-3 text-sm text-amber-200">Vehicle model unavailable. Check Git LFS assets or select another vehicle.</p></Html>}>
        <Suspense fallback={<Html center><p className="text-sm text-cyan-200">Loading vehicle…</p></Html>}>
          <VehiclePreviewModel />
        </Suspense>
      </AssetBoundary>
      {reflections && <AssetBoundary fallback={null}><Suspense fallback={null}><Environment preset="night" /></Suspense></AssetBoundary>}

      <Grid
        args={[20, 20]}
        position={[0, -0.02, 0]}
        cellSize={1}
        cellThickness={0.5}
        sectionSize={5}
        sectionThickness={1.2}
        fadeDistance={18}
        fadeStrength={1}
      />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        enableRotate
        maxPolarAngle={Math.PI / 2 - 0.05}
        minPolarAngle={Math.PI / 8}
      />

      <VehicleRotatingCamera radius={7} height={2.4} speed={0.35} />
    </>
  );
}