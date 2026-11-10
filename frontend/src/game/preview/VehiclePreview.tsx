import {useUIStore} from "../../store/menus/uiStore";
import {SELECTION_CRIMSON} from "../../theme/garageLighting";
import { Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MathUtils, Vector3, type Group, type PerspectiveCamera as ThreePerspectiveCamera } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { Html, PerspectiveCamera } from "@react-three/drei";

import { useSelectionStore } from "../../store/selection/selectionStore";
import { VehiclePreviewModel } from "./VehiclePreviewModel";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { GarageEnvironment } from "./GarageEnvironment";
import { PreviewTurntable } from "./PreviewTurntable";
import { DEFAULT_PREVIEW_PLATFORM } from "./previewPlacement";
import { useSocialStore } from "../../store/social/socialStore";
import { DEFAULT_CHARACTER, type CharacterChoice } from "../characters/characterCatalog";
import { CHARACTER_ZOOM_MAX, CHARACTER_ZOOM_MIN, useCharacterPreviewStore } from "../characters/characterPreviewStore";
import { HEROES, useAlphaStore } from "../../store/alpha/alphaStore";
import { PREVIEW_ZOOM_LEVELS, usePreviewZoom } from "./previewZoomStore";

const DRIVER_STAGE_CAMERA: [number, number, number] = [2.8, 2.5, 5.8];
const STANDARD_STAGE_CAMERA: [number, number, number] = [0, 3.2, 7.25];

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
  const mode = useAlphaStore(s => s.mode);
  const favorite = useSelectionStore(s => s.getSelectedVehicle().id);
  const workshop = screen === "heroes";
  const zoom = usePreviewZoom(s => !wardrobeOpen && (workshop || screen === "hero_select") ? PREVIEW_ZOOM_LEVELS[s.level] : 1);
  const sandboxPicker = screen === "hero_select" && mode === "sandbox";
  const driverStage = workshop || sandboxPicker;
  const equipped = useSocialStore(s => driverStage ? s.view?.profile.progression?.character : null);
  const driver = driverStage ? characterDraft ?? equipped ?? DEFAULT_CHARACTER : null;
  const selected = HEROES.find(hero => hero.id === picked)?.vehicle;
  const vehicleId = awaitingHero ? selected ?? (driverStage ? favorite : undefined) : favorite;
  const { width, height } = useThree(s => s.size);
  const cameraRef = useRef<ThreePerspectiveCamera>(null);
  const aim = useMemo(() => ({ target: new Vector3(), scale: new Vector3() }), []);
  const [turntable, setTurntable] = useState<Group | null>(null);
  const [platform, setPlatform] = useState<[number, number]>(
    DEFAULT_PREVIEW_PLATFORM,
  );
  const aspect = width / Math.max(1, height);
  const verticalFov = (horizontal: number) => (2 * Math.atan(Math.tan((horizontal * Math.PI) / 360) / aspect) * 180) / Math.PI;
  // Look into the authored corner from inside the room. The tighter horizontal
  // frame keeps the two connected walls across a landscape viewport.
  const fov = driverStage && aspect >= 1 ? Math.max(33, verticalFov(75)) : Math.max(60, verticalFov(75));
  const cameraPosition = driverStage ? DRIVER_STAGE_CAMERA : STANDARD_STAGE_CAMERA;
  useLayoutEffect(() => {
    const camera = cameraRef.current;
    if (!camera || !width || !height) return;
    const offsetX = width * (sandboxPicker ? .15 : workshop && !wardrobeOpen ? .07 : 0);
    const offsetY = wardrobeOpen ? height * .055 : heroLayout && aspect < 1 ? -height * .04 : 0;
    camera.zoom = zoom;
    camera.setViewOffset(width, height, offsetX, offsetY, width, height);
    camera.position.set(...cameraPosition);
    camera.lookAt(0, driverStage ? 1.17 : 1.35, 0);
  }, [aspect, cameraPosition, driverStage, height, heroLayout, sandboxPicker, wardrobeOpen, width, workshop, zoom]);
  useFrame(() => {
    if (!wardrobeOpen || !cameraRef.current) return;
    const anchor = turntable?.getObjectByName("garage-driver");
    if (!anchor) return;
    const view = useCharacterPreviewStore.getState();
    const height = view.camera === "Face" ? 1.56 : view.camera === "Hands" ? 1.12 : .9;
    const distance = view.camera === "Face" ? 1.25 : view.camera === "Hands" ? 1.95 : 4.25;
    const scale = anchor.getWorldScale(aim.scale).y;
    const radius = distance * scale / MathUtils.clamp(view.zoom, CHARACTER_ZOOM_MIN, CHARACTER_ZOOM_MAX);
    const target = anchor.getWorldPosition(aim.target);
    target.y += height * scale;
    const head = view.camera === "Face" && anchor.getObjectByName("head");
    if (head) {
      head.getWorldPosition(target);
      target.y += .075 * scale;
    }
    cameraRef.current.position.set(target.x + radius * .14, target.y + radius * .08, target.z + radius);
    cameraRef.current.lookAt(target);
  });
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

      <PreviewTurntable onReady={setTurntable} spin={!wardrobeOpen}>
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
              <VehiclePreviewModel platform={platform} model={vehicleId} driver={driver} previewPacks={wardrobeOpen} />
            </group>
          </Suspense>
        </AssetBoundary>}
      </PreviewTurntable>

    </>
  );
}
