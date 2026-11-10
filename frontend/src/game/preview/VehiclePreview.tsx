import {useUIStore} from "../../store/menus/uiStore";
import {SELECTION_CRIMSON} from "../../theme/garageLighting";
import { Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MathUtils, Matrix4, Quaternion, Vector3, type Group, type PerspectiveCamera as ThreePerspectiveCamera } from "three";
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
  const reducedMotion=usePreferencesStore(s=>s.reducedMotion);
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
  const requestFrame = useThree(s => s.invalidate);
  const cameraRef = useRef<ThreePerspectiveCamera>(null);
  const initializedCamera = useRef<ThreePerspectiveCamera>(null);
  const aim = useMemo(() => ({
    position: new Vector3(), target: new Vector3(), offset: new Vector3(), scale: new Vector3(),
    pivot: new Vector3(), eye: new Vector3(), nextEye: new Vector3(),
    anchorRotation: new Quaternion(), orbit: new Quaternion(), swing: new Quaternion(), lookAt: new Matrix4(),
  }), []);
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
  useLayoutEffect(() => { requestFrame(); }, [width, height, driverStage, heroLayout, sandboxPicker, wardrobeOpen, workshop, zoom, reducedMotion, requestFrame]);
  useFrame(({ frameloop, invalidate }, delta) => {
    const camera = cameraRef.current;
    if (!camera || !width || !height) return;
    const { position, target, offset, anchorRotation, pivot, eye, nextEye, orbit, swing, lookAt } = aim;
    position.set(...cameraPosition);
    target.set(0, driverStage ? 1.17 : 1.35, 0);
    let lensZoom = zoom;
    if (wardrobeOpen) {
      const view = useCharacterPreviewStore.getState();
      const wide = view.camera === "Whole car";
      const cockpit = view.insideCar ? turntable?.getObjectByName(wide ? "garage-cockpit-overview" : "garage-cockpit-camera") : undefined;
      const anchor = cockpit || wide ? undefined : turntable?.getObjectByName("garage-driver");
      if (wide && !cockpit) lensZoom = view.zoom;
      if (cockpit) {
        cockpit.children[0].getWorldPosition(position);
        cockpit.getWorldPosition(target);
      } else if (anchor) {
        const eyeHeight = view.camera === "Face" ? 1.56 : view.camera === "Hands" ? 1.12 : .9;
        const distance = view.camera === "Face" ? .52 : view.camera === "Hands" ? 1.95 : 4.25;
        const scale = anchor.getWorldScale(aim.scale).y;
        const radius = distance * scale / MathUtils.clamp(view.zoom, CHARACTER_ZOOM_MIN, CHARACTER_ZOOM_MAX);
        anchor.getWorldPosition(target);
        target.setY(target.y + eyeHeight * scale);
        if (view.camera === "Face") {
          const focus = anchor.getObjectByName("villager-face-focus");
          const head = focus ?? anchor.getObjectByName("head");
          if (head) {
            head.getWorldPosition(target);
            if (!focus) target.setY(target.y + .035 * scale);
          }
          anchor.getWorldQuaternion(anchorRotation);
          offset.set(0, radius * .13, radius).applyQuaternion(anchorRotation);
        } else {
          offset.set(radius * .14, radius * .08, radius);
        }
        position.copy(target).add(offset);
      }
    }
    const offsetX = width * (sandboxPicker ? .15 : workshop && !wardrobeOpen ? .07 : 0);
    const offsetY = wardrobeOpen ? height * .055 : heroLayout && aspect < 1 ? -height * .04 : 0;
    const firstFrame = initializedCamera.current !== camera;
    initializedCamera.current = camera;
    const blend = firstFrame || reducedMotion ? 1 : 1 - Math.exp(-10 * Math.min(delta, .1));
    if (blend === 1) {
      pivot.copy(target);
      camera.position.copy(position);
    } else {
      // Arc around the subject when angles differ, even after a large turntable drag.
      eye.subVectors(camera.position, pivot);
      nextEye.subVectors(position, target);
      const radius = MathUtils.lerp(eye.length(), nextEye.length(), blend);
      swing.setFromUnitVectors(eye.normalize(), nextEye.normalize());
      eye.applyQuaternion(orbit.identity().slerp(swing, blend)).multiplyScalar(radius);
      camera.position.copy(pivot.lerp(target, blend)).add(eye);
    }
    camera.quaternion.setFromRotationMatrix(lookAt.lookAt(camera.position, pivot, camera.up));
    const currentX = camera.view?.offsetX ?? offsetX;
    const currentY = camera.view?.offsetY ?? offsetY;
    const reframing = Math.abs(currentX - offsetX) > .01 || Math.abs(currentY - offsetY) > .01 || Math.abs(camera.zoom - lensZoom) > .0001;
    if (reframing || camera.view?.fullWidth !== width || camera.view?.fullHeight !== height) {
      camera.zoom = MathUtils.lerp(camera.zoom, lensZoom, blend);
      camera.setViewOffset(width, height, MathUtils.lerp(currentX, offsetX, blend), MathUtils.lerp(currentY, offsetY, blend), width, height);
    }
    if (frameloop === "demand" && (reframing || camera.position.distanceToSquared(position) > .000001 || pivot.distanceToSquared(target) > .000001)) invalidate();
  }, -.25);
  return (
    <>
      <GarageEnvironment turntable={turntable} onPlatformReady={setPlatform} accentOverride={selectionAccent} />
      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        fov={fov}
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
