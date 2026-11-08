import {useUIStore} from "../../store/menus/uiStore";
import {SELECTION_CRIMSON} from "../../theme/garageLighting";
import { Suspense, useState } from "react";
import { Group } from "three";
import { useThree } from "@react-three/fiber";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { Html, PerspectiveCamera } from "@react-three/drei";

import { useSelectionStore } from "../../store/selection/selectionStore";
import { VehiclePreviewModel } from "./VehiclePreviewModel";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { GarageEnvironment } from "./GarageEnvironment";
import { PreviewTurntable } from "./PreviewTurntable";
import { DEFAULT_PREVIEW_PLATFORM } from "./previewPlacement";
import { HEROES, useAlphaStore } from "../../store/alpha/alphaStore";

export function VehiclePreview({
  heroLayout = false,
  awaitingHero = false,
}: { heroLayout?: boolean; awaitingHero?: boolean } = {}) {
  const screen=useUIStore(s=>s.screen);
  const theme=usePreferencesStore(s=>s.theme);
  const staging=screen==="hero_select"||screen==="heroes"||screen==="queue";
  // Team identity belongs in the selection UI; fixtures and reflections keep
  // the saved theme, including its softer crimson selection lighting.
  const selectionAccent=staging && theme==="scarlet" ? SELECTION_CRIMSON : null;
  const picked = useAlphaStore(s => screen === "heroes" ? s.previewHero : s.hero);
  const favorite = useSelectionStore(s => s.getSelectedVehicle().id);
  const vehicleId = awaitingHero ? HEROES.find(hero => hero.id === picked)?.vehicle : favorite;
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
  const cameraPosition: [number, number, number] = [0, 3.2, radius];
  return (
    <>
      <GarageEnvironment turntable={turntable} onPlatformReady={setPlatform} accentOverride={selectionAccent} />
      <PerspectiveCamera
        makeDefault
        fov={fov}
        position={cameraPosition}
        near={0.1}
        onUpdate={(camera) => {
          const portrait = aspect < 1;
          const offsetY = heroLayout && portrait ? -size.height * 0.04 : 0;
          camera.setViewOffset(size.width, size.height, 0, offsetY, size.width, size.height);
          camera.lookAt(0, 1.35, 0);
        }}
      />

      <PreviewTurntable onReady={setTurntable}>
        {vehicleId && <AssetBoundary
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
              <VehiclePreviewModel platform={platform} model={vehicleId} />
            </group>
          </Suspense>
        </AssetBoundary>}
      </PreviewTurntable>

    </>
  );
}
