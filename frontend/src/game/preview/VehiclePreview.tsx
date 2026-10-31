import { Suspense, useState } from "react";
import { Group } from "three";
import { useThree } from "@react-three/fiber";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { Html, OrbitControls, PerspectiveCamera } from "@react-three/drei";

import { useSelectionStore } from "../../store/selection/selectionStore";
import { VehiclePreviewModel } from "./VehiclePreviewModel";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { GarageEnvironment } from "./GarageEnvironment";
import { PreviewTurntable } from "./PreviewTurntable";
import { DEFAULT_PREVIEW_PLATFORM } from "./previewPlacement";

export function VehiclePreview({
  heroLayout = false,
}: { heroLayout?: boolean } = {}) {
  const vehicleId = useSelectionStore((s) => s.getSelectedVehicle().id);
  const reducedMotion = usePreferencesStore((s) => s.reducedMotion);
  const size = useThree((s) => s.size);
  const [turntable, setTurntable] = useState<Group | null>(null);
  const [platform, setPlatform] = useState<[number, number]>(
    DEFAULT_PREVIEW_PLATFORM,
  );
  // Frame the full-screen showroom, including the view through transparent
  // controls. Vehicle changes retain this same camera and turntable angle.
  // Stay inside the room on phones. Widen vertical FOV instead of moving the
  // camera outside and clipping away the racks, aluminum frame and lights.
  // One shared camera frames the enlarged chassis throughout the turntable.
  // The cannon is free to overhang instead of limiting the lineup's size.
  const radius = 7.25;
  const aspect = size.width / Math.max(1, size.height);
  // Give the enlarged turret headroom while keeping the chassis visible on phones.
  const fov = Math.max(
    60,
    (2 * Math.atan(Math.tan((75 * Math.PI) / 360) / aspect) * 180) / Math.PI,
  );
  const targetY = 1.8;
  return (
    <>
      <GarageEnvironment turntable={turntable} onPlatformReady={setPlatform} />
      <PerspectiveCamera
        makeDefault
        fov={fov}
        position={[radius * 0.75, 3.2, radius * 0.66]}
        near={0.1}
        onUpdate={(camera) => {
          const portrait = aspect < 1;
          const offsetY =
            heroLayout && portrait
              ? -size.height * 0.1
              : Math.min(40, size.height * 0.06);
          camera.setViewOffset(
            size.width,
            size.height,
            heroLayout ? size.width * (portrait ? 0.08 : 0.12) : 0,
            offsetY,
            size.width,
            size.height,
          );
        }}
      />

      <PreviewTurntable onReady={setTurntable}>
        <AssetBoundary
          key={vehicleId}
          fallback={
            <Html center>
              <p className="rounded bg-slate-950 p-3 text-sm text-amber-200">
                Vehicle model unavailable. Check Git LFS assets or select
                another vehicle.
              </p>
            </Html>
          }
        >
          <Suspense fallback={null}>
            <group rotation={[0, Math.PI / 2, 0]}>
              <VehiclePreviewModel platform={platform} />
            </group>
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
