import { Suspense, useState } from "react";
import { Group } from "three";
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
import { GarageEnvironment } from "./GarageEnvironment";
import { PreviewTurntable } from "./PreviewTurntable";

export function VehiclePreview() {
  const vehicleId = useSelectionStore((s) => s.getSelectedVehicle().id);
  const reducedMotion = usePreferencesStore((s) => s.reducedMotion);
  const size = useThree(s => s.size);
  const [turntable, setTurntable] = useState<Group | null>(null);
  // Frame the full-screen showroom, including the view through transparent
  // controls. Vehicle changes retain this same camera and turntable angle.
  const radius = Math.max(8.5, 7.3 * size.height / Math.max(1, size.width));
  const targetY = 1.6;
  return (
    <>
      <GarageEnvironment turntable={turntable} />
      <PerspectiveCamera makeDefault fov={50} position={[radius * 0.75, 3.2, radius * 0.66]} near={Math.max(0.1, radius - 6)}
        onUpdate={camera => {
          // Portrait framing can put the camera beyond a garage wall. The
          // near plane cuts away that foreground while retaining the stage.
          // Keep the car above the selector rows, especially on short phones.
          const offsetY = Math.min(56, size.height * 0.1);
          camera.setViewOffset(size.width, size.height, 0, offsetY, size.width, size.height);
        }} />

      <PreviewTurntable onReady={setTurntable}>
        <AssetBoundary key={vehicleId} fallback={<Html center><p className="rounded bg-slate-950 p-3 text-sm text-amber-200">Vehicle model unavailable. Check Git LFS assets or select another vehicle.</p></Html>}>
          <Suspense fallback={<Html center><p className="text-sm text-cyan-200">Loading vehicle…</p></Html>}>
            <group rotation={[0, Math.PI / 2, 0]}><VehiclePreviewModel /></group>
          </Suspense>
        </AssetBoundary>
      </PreviewTurntable>

      <OrbitControls
        makeDefault
        target={[0, targetY, 0]}
        autoRotate={false}
        enableDamping={!reducedMotion}
        enablePan={false}
        enableZoom={false}
        enableRotate
        maxPolarAngle={Math.PI / 2 - 0.05}
        minPolarAngle={Math.PI / 8}
      />

    </>
  );
}
