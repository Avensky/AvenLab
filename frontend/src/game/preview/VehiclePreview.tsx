import { Suspense } from "react";
import { useThree } from "@react-three/fiber";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import {
  Html,
  OrbitControls,
  PerspectiveCamera,
} from "@react-three/drei";

import { useSelectionStore } from "../../store/selectionStore";
import { VehiclePreviewModel } from "./VehiclePreviewModel";
import { usePreferencesStore } from "../../store/preferencesStore";
import { Showroom } from "./Showroom";

export function VehiclePreview() {
  const vehicleId = useSelectionStore((s) => s.getSelectedVehicle().id);
  const reducedMotion = usePreferencesStore((s) => s.reducedMotion);
  const size = useThree(s => s.size);
  // Common framing includes the largest model. Selection never moves camera
  // or target; only resizing the viewport adjusts the initial framing.
  const radius = Math.max(10, 9.6 * size.height / Math.max(1, size.width));
  return (
    <>
      <Showroom />
      <PerspectiveCamera makeDefault fov={55} position={[-radius, 2.1, 0]}
        onUpdate={camera => {
          // Keep the car above the selector rows, especially on short phones.
          const offsetY = Math.min(96, size.height * (size.width > size.height ? 0.18 : 0.09));
          camera.setViewOffset(size.width, size.height, 0, offsetY, size.width, size.height);
        }} />

      <AssetBoundary key={vehicleId} fallback={<Html center><p className="rounded bg-slate-950 p-3 text-sm text-amber-200">Vehicle model unavailable. Check Git LFS assets or select another vehicle.</p></Html>}>
        <Suspense fallback={<Html center><p className="text-sm text-cyan-200">Loading vehicle…</p></Html>}>
          <VehiclePreviewModel />
        </Suspense>
      </AssetBoundary>

      <OrbitControls
        makeDefault
        target={[0, 1.1, 0]}
        autoRotate={!reducedMotion}
        enableDamping={!reducedMotion}
        autoRotateSpeed={0.7}
        enablePan={false}
        enableZoom={false}
        enableRotate
        maxPolarAngle={Math.PI / 2 - 0.05}
        minPolarAngle={Math.PI / 8}
      />

    </>
  );
}
