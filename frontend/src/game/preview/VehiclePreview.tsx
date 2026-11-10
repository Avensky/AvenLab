import {useUIStore} from "../../store/menus/uiStore";
import {SELECTION_CRIMSON} from "../../theme/garageLighting";
import { Suspense, useLayoutEffect, useRef, useState } from "react";
import type { Group, PerspectiveCamera as ThreePerspectiveCamera } from "three";
import { useThree } from "@react-three/fiber";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { Html, PerspectiveCamera } from "@react-three/drei";

import { useSelectionStore } from "../../store/selection/selectionStore";
import { VehiclePreviewModel } from "./VehiclePreviewModel";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { GarageEnvironment } from "./GarageEnvironment";
import { PreviewTurntable } from "./PreviewTurntable";
import { DEFAULT_PREVIEW_PLATFORM } from "./previewPlacement";
import { useSocialStore } from "../../store/social/socialStore";
import type { CharacterChoice } from "../characters/characterCatalog";
import { HEROES, useAlphaStore } from "../../store/alpha/alphaStore";

export function VehiclePreview({
  heroLayout = false,
  awaitingHero = false,
  characterDraft = null,
  wardrobeOpen = false,
}: { heroLayout?: boolean; awaitingHero?: boolean; characterDraft?: CharacterChoice | null; wardrobeOpen?: boolean } = {}) {
  const screen=useUIStore(s=>s.screen);
  const theme=usePreferencesStore(s=>s.theme);
  const staging=screen==="hero_select"||screen==="heroes"||screen==="queue";
  // Team identity belongs in the selection UI; fixtures and reflections keep
  // the saved theme, including its softer crimson selection lighting.
  const selectionAccent=staging && theme==="scarlet" ? SELECTION_CRIMSON : null;
  const picked = useAlphaStore(s => screen === "heroes" ? s.previewHero : s.hero);
  const favorite = useSelectionStore(s => s.getSelectedVehicle().id);
  const equipped = useSocialStore(s => screen === "heroes" ? s.view?.profile.progression?.character : null);
  const driver = characterDraft ?? equipped;
  const selected = HEROES.find(hero => hero.id === picked)?.vehicle;
  const vehicleId = awaitingHero ? selected ?? (screen === "heroes" && driver ? favorite : undefined) : favorite;
  const { width, height } = useThree(s => s.size);
  const cameraRef = useRef<ThreePerspectiveCamera>(null);
  const [turntable, setTurntable] = useState<Group | null>(null);
  const [platform, setPlatform] = useState<[number, number]>(
    DEFAULT_PREVIEW_PLATFORM,
  );
  const aspect = width / Math.max(1, height);
  const workshop = screen === "heroes";
  const verticalFov = (horizontal: number) => (2 * Math.atan(Math.tan((horizontal * Math.PI) / 360) / aspect) * 180) / Math.PI;
  // Look into the authored corner from inside the room. The tighter horizontal
  // frame keeps the two connected walls across a landscape viewport.
  const fov = workshop && aspect >= 1 ? Math.max(33, verticalFov(75)) : Math.max(60, verticalFov(75));
  const cameraPosition: [number, number, number] = workshop ? [2.8, 2.5, 5.8] : [0, 3.2, 7.25];
  useLayoutEffect(() => {
    const camera = cameraRef.current;
    if (!camera || !width || !height) return;
    const offsetX = width * (workshop ? (wardrobeOpen ? .15 : .07) : 0);
    const offsetY = heroLayout && aspect < 1 ? -height * .04 : 0;
    camera.setViewOffset(width, height, offsetX, offsetY, width, height);
    camera.lookAt(0, workshop ? 1.17 : 1.35, 0);
  }, [aspect, height, heroLayout, wardrobeOpen, width, workshop]);
  return (
    <>
      <GarageEnvironment turntable={turntable} onPlatformReady={setPlatform} accentOverride={selectionAccent} />
      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        fov={fov}
        position={cameraPosition}
        near={0.1}
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
              <VehiclePreviewModel platform={platform} model={vehicleId} driver={driver} />
            </group>
          </Suspense>
        </AssetBoundary>}
      </PreviewTurntable>

    </>
  );
}
