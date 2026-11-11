import {useUIStore} from "../../store/menus/uiStore";
import {SELECTION_CRIMSON} from "../../theme/garageLighting";
import { Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MathUtils, Matrix4, Quaternion, Vector2, Vector3, type Group, type Object3D, type PerspectiveCamera as ThreePerspectiveCamera } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { Html, PerspectiveCamera } from "@react-three/drei";

import { useSelectionStore } from "../../store/selection/selectionStore";
import { VehiclePreviewModel, type VehiclePreviewDriverFit } from "./VehiclePreviewModel";
import { GarageDriver } from "../characters/GarageDriver";
import { PreviewContactShadow } from "./PreviewContactShadow";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { GarageEnvironment } from "./GarageEnvironment";
import { PreviewTurntable } from "./PreviewTurntable";
import { DEFAULT_PREVIEW_PLATFORM } from "./previewPlacement";
import { selectEquippedCharacter, useSocialStore } from "../../store/social/socialStore";
import { clothingFrame } from "../characters/clothingFraming";
import { GARAGE_LEAN_ID } from "../characters/garageLean";
import { MIRROR_CHECK_ID } from "../characters/mirrorCheck";
import { DEFAULT_CHARACTER, type CharacterChoice } from "../characters/characterCatalog";
import { CHARACTER_ZOOM_MAX, CHARACTER_ZOOM_MIN, failCockpitPreview, useCharacterPreviewStore } from "../characters/characterPreviewStore";
import { HEROES, useAlphaStore } from "../../store/alpha/alphaStore";
import { PREVIEW_ZOOM_LEVELS, usePreviewZoom } from "./previewZoomStore";
import { PreviewLoadingStatus } from "./PreviewLoadingSeal";
import { isCompactPreview } from "./previewBudget";
import { garageCamera, useGarageDrive } from "./garageDriveStore";
import { GARAGE_STATIONS } from "./garageStations";
import { useVehicleStudioStore } from "../heroes/vehicleStudioStore";

const DRIVER_STAGE_CAMERA: [number, number, number] = [2.8, 2.5, 5.8];
const STANDARD_STAGE_CAMERA: [number, number, number] = [0, 3.2, 7.25];
const motionQuery = "(prefers-reduced-motion: reduce)";
const systemReducedMotion = () => window.matchMedia?.(motionQuery).matches ?? false;
function subscribeMotion(listener: () => void) {
  const media = window.matchMedia?.(motionQuery);
  media?.addEventListener("change", listener);
  return () => media?.removeEventListener("change", listener);
}

function MissingVehicle({ model, onSettled, cockpit }: { model: string; onSettled: (model: string) => void; cockpit: boolean }) {
  useLayoutEffect(() => onSettled(model), [model, onSettled]);
  useLayoutEffect(() => {
    if (cockpit) failCockpitPreview("The selected vehicle model is unavailable.");
  }, [cockpit]);
  return <Html center>
    <p className="rounded bg-slate-950 p-3 text-sm text-amber-200">
      Vehicle model unavailable. Check Git LFS assets or select another vehicle.
    </p>
  </Html>;
}

function findPreviewAnchor(cache: Map<string, Object3D>, root: Object3D | null, name: string) {
  if (!root) return;
  const saved = cache.get(name);
  for (let node: Object3D | null | undefined = saved; node; node = node.parent) {
    if (node === root) return saved;
  }
  const anchor = root.getObjectByName(name);
  if (anchor) cache.set(name, anchor);
  return anchor;
}

export function VehiclePreview({
  heroLayout = false,
  awaitingHero = false,
  characterDraft = null,
  wardrobeOpen = false,
  stationary = false,
}: { heroLayout?: boolean; awaitingHero?: boolean; characterDraft?: CharacterChoice | null; wardrobeOpen?: boolean; stationary?: boolean } = {}) {
  const screen=useUIStore(s=>s.screen);
  const theme=usePreferencesStore(s=>s.theme);
  const preferenceReducedMotion = usePreferencesStore(s => s.reducedMotion);
  const systemMotion = useSyncExternalStore(subscribeMotion, systemReducedMotion, () => false);
  const reducedMotion = preferenceReducedMotion || systemMotion;
  const staging=screen==="hero_select"||screen==="heroes"||screen==="queue";
  // Team identity belongs in the selection UI; fixtures and reflections keep
  // the saved theme, including its softer crimson selection lighting.
  const selectionAccent=staging && theme==="scarlet" ? SELECTION_CRIMSON : null;
  const picked = useAlphaStore(s => screen === "heroes" ? s.previewHero : s.hero);
  const mode = useAlphaStore(s => s.mode);
  const favorite = useSelectionStore(s => s.getSelectedVehicle().id);
  const workshop = screen === "heroes";
  const garageTab = useVehicleStudioStore(s => s.activeTab);
  const garageOpen = workshop && !wardrobeOpen && garageTab !== null;
  const garageView = useGarageDrive(s => workshop && !wardrobeOpen ? garageCamera(s) : "Showroom");
  const stationActive = useGarageDrive(s => garageOpen && s.stage !== "idle");
  const zoom = usePreviewZoom(s => !wardrobeOpen && (workshop || screen === "hero_select") ? PREVIEW_ZOOM_LEVELS[s.level] : 1);
  const sandboxPicker = screen === "hero_select" && mode === "sandbox";
  const driverStage = workshop || ["mode_select", "hero_select", "queue", "sandbox_setup", "signal_recon_setup"].includes(screen);
  const equipped = useSocialStore(s => driverStage ? selectEquippedCharacter(s) : null);
  const savedHero = useSocialStore(s => workshop ? s.view?.profile.progression?.default_hero : undefined);
  const driver = driverStage ? characterDraft ?? equipped ?? DEFAULT_CHARACTER : null;
  const selected = HEROES.find(hero => hero.id === (picked ?? savedHero))?.vehicle;
  const insideCar = useCharacterPreviewStore(s => wardrobeOpen && s.insideCar);
  const fittingToCar = useCharacterPreviewStore(s => wardrobeOpen && (s.emote?.id === GARAGE_LEAN_ID || s.emote?.id === MIRROR_CHECK_ID));
  const vehicleId = awaitingHero ? selected ?? (driverStage ? favorite : undefined) : favorite;
  const lastVehicle = useRef(vehicleId);
  useLayoutEffect(() => {
    if (lastVehicle.current !== vehicleId) {
      lastVehicle.current = vehicleId;
      if (workshop) useGarageDrive.getState().leaveVehicle();
    }
  }, [vehicleId, workshop]);
  useLayoutEffect(() => {
    if (workshop) return () => useGarageDrive.getState().reset();
  }, [workshop]);
  useLayoutEffect(() => {
    if (!wardrobeOpen) return;
    useCharacterPreviewStore.setState({ cockpitVehicle: vehicleId ?? null });
    return () => useCharacterPreviewStore.setState({ cockpitVehicle: null });
  }, [wardrobeOpen, vehicleId]);
  const closeShot = insideCar || garageView === "Cockpit" || garageView === "Dashboard";
  const near = garageView === "Dashboard" ? .01 : closeShot ? (vehicleId && GARAGE_STATIONS[vehicleId].kind === "bridge" ? .003 : .04) : .1;
  const [settledVehicle, setSettledVehicle] = useState<string>();
  const [roomReady, setRoomReady] = useState(false);
  const roomSettled = useCallback(() => setRoomReady(true), []);
  const waitingForCar = Boolean(vehicleId && vehicleId !== settledVehicle);
  const loadLabel = waitingForCar ? "Summoning vehicle" : !roomReady ? "Preparing garage" : null;
  const { width, height } = useThree(s => s.size);
  const compact = isCompactPreview(width);
  const requestFrame = useThree(s => s.invalidate);
  const cameraRef = useRef<ThreePerspectiveCamera>(null);
  const motion = useRef<Group>(null);
  const initializedCamera = useRef<ThreePerspectiveCamera>(null);
  const aim = useMemo(() => ({
    position: new Vector3(), target: new Vector3(), offset: new Vector3(), scale: new Vector3(),
    pivot: new Vector3(), eye: new Vector3(), nextEye: new Vector3(),
    anchorRotation: new Quaternion(), orbit: new Quaternion(), swing: new Quaternion(), lookAt: new Matrix4(),
    itemKey: "", itemCenter: new Vector3(), itemDistance: 1,
    anchors: new Map<string, Object3D>(), cameraMin: new Vector3(), cameraMax: new Vector3(),
    renderedVehicle: undefined as typeof vehicleId, renderedView: "", inStation: false, held: false,
    heldPosition: new Vector3(), heldTarget: new Vector3(), heldOffset: new Vector2(), heldFov: 0, heldNear: 0,
  }), []);
  const [turntable, setTurntable] = useState<Group | null>(null);
  const [platform, setPlatform] = useState<[number, number]>(
    DEFAULT_PREVIEW_PLATFORM,
  );
  const [currentDriverFit, setCurrentDriverFit] = useState<VehiclePreviewDriverFit>();
  const [parkedDriverFit, setParkedDriverFit] = useState<VehiclePreviewDriverFit>();
  const reportDriverFit = useCallback((fit: VehiclePreviewDriverFit) => {
    setCurrentDriverFit(fit);
    setParkedDriverFit(previous => previous && previous.model !== fit.model ? previous : fit);
  }, []);
  const vehicleFit = currentDriverFit?.model === vehicleId ? currentDriverFit : undefined;
  const driverPose = (stationActive || insideCar || fittingToCar) && vehicleFit ? vehicleFit : parkedDriverFit;
  const aspect = width / Math.max(1, height);
  const verticalFov = (horizontal: number) => (2 * Math.atan(Math.tan((horizontal * Math.PI) / 360) / aspect) * 180) / Math.PI;
  // Look into the authored corner from inside the room. The tighter horizontal
  // frame keeps the two connected walls across a landscape viewport.
  const fov = garageView === "Dashboard" ? vehicleId === "timecar" ? Math.max(60, verticalFov(100)) : Math.max(38, verticalFov(76))
    : garageView === "Driver Door" ? Math.max(44, verticalFov(85)) : closeShot && vehicleId && GARAGE_STATIONS[vehicleId].kind === "wheel"
    ? Math.max(52, verticalFov(95))
    : driverStage && aspect >= 1 ? Math.max(33, verticalFov(75)) : Math.max(60, verticalFov(75));
  const cameraPosition = driverStage ? DRIVER_STAGE_CAMERA : STANDARD_STAGE_CAMERA;
  useLayoutEffect(() => { requestFrame(); }, [width, height, driverStage, heroLayout, sandboxPicker, wardrobeOpen, workshop, zoom, reducedMotion, requestFrame, garageView, garageTab, vehicleId, settledVehicle, stationActive, insideCar]);
  useLayoutEffect(() => useCharacterPreviewStore.subscribe(() => requestFrame()), [requestFrame]);
  useFrame(({ frameloop, invalidate, scene }, delta) => {
    const camera = cameraRef.current;
    if (!camera || !width || !height) return;
    const { position, target, offset, anchorRotation, pivot, eye, nextEye, orbit, swing, lookAt } = aim;
    const wardrobe = wardrobeOpen ? useCharacterPreviewStore.getState() : null;
    const viewKey = wardrobe ? `${screen}:${wardrobe.camera}:${wardrobe.focusRevision}:${insideCar}` : `${screen}:${garageView}`;
    const firstFrame = initializedCamera.current !== camera;
    if (firstFrame || aim.renderedView !== viewKey || stationActive && !aim.inStation) aim.held = false;
    else if (vehicleId && aim.renderedVehicle && vehicleId !== aim.renderedVehicle) {
      // Keep the rendered framing, including an in-progress orbit, until the
      // player changes the camera. A new car's mounts can be far apart.
      aim.held = true;
      aim.heldPosition.copy(camera.position);
      aim.heldTarget.copy(pivot);
      aim.heldOffset.set((camera.view?.offsetX ?? 0) / width, (camera.view?.offsetY ?? 0) / height);
      aim.heldFov = camera.fov;
      aim.heldNear = camera.near;
    }
    aim.renderedVehicle = vehicleId;
    aim.renderedView = viewKey;
    aim.inStation = stationActive;

    position.set(...cameraPosition);
    target.set(0, driverStage ? 1.17 : 1.35, 0);
    let lensZoom = zoom;
    if (!aim.held && garageView !== "Showroom") {
      const occupiedShot = garageView === "Cockpit" && stationActive
        ? findPreviewAnchor(aim.anchors, turntable, "garage-cockpit-camera") : undefined;
      const shot = occupiedShot ?? findPreviewAnchor(aim.anchors, turntable, `garage-view-${garageView}`);
      if (shot) {
        shot.getWorldPosition(target);
        shot.children[0].getWorldPosition(position);
        if (garageView === "Cockpit") lensZoom = Math.min(1.2, zoom);
      }
    }
    if (wardrobe && !aim.held) {
      const view = wardrobe;
      const wide = view.camera === "Whole car";
      const cockpit = insideCar ? findPreviewAnchor(aim.anchors, turntable, wide ? "garage-cockpit-overview" : "garage-cockpit-camera") : undefined;
      const anchor = cockpit || wide || insideCar ? undefined : findPreviewAnchor(aim.anchors, turntable, "garage-driver");
      if (wide && !cockpit) lensZoom = view.zoom;
      if (cockpit) {
        cockpit.children[0].getWorldPosition(position);
        cockpit.getWorldPosition(target);
      } else if (anchor) {
        const eyeHeight = view.camera === "Face" ? 1.56 : view.camera === "Hands" ? 1.12 : .9;
        const distance = view.camera === "Face" ? .52 : view.camera === "Hands" ? 1.95 : 4.25;
        const scale = anchor.getWorldScale(aim.scale).y;
        let radius = distance * scale / MathUtils.clamp(view.zoom, CHARACTER_ZOOM_MIN, CHARACTER_ZOOM_MAX);
        if (view.camera !== "Selected item") radius *= Math.max(1, height / Math.max(1, view.viewport?.height || height) * .72);
        anchor.getWorldPosition(target);
        target.setY(target.y + eyeHeight * scale);
        if (view.camera === "Selected item") {
          const key = [anchor.uuid, anchor.children[0]?.uuid, view.focusRevision, view.selectedPiece, driver?.wardrobe?.set, driver?.wardrobe?.shirt, driver?.wardrobe?.waist, driver?.appearance?.glasses, width, height, view.viewport?.width, view.viewport?.height].join(":");
          if (aim.itemKey !== key) {
            const area = view.viewport;
            const shot = clothingFrame(anchor, view.selectedPiece, fov, area?.width && area.height ? area.width / area.height : aspect);
            // Keep the selected region attached to the stage, not to the rotating clothing.
            aim.itemCenter.copy(shot.center);
            anchor.parent!.parent!.worldToLocal(aim.itemCenter);
            aim.itemDistance = shot.distance * height / Math.max(1, area?.height || height);
            aim.itemKey = key;
          }
          anchor.parent!.parent!.localToWorld(target.copy(aim.itemCenter));
          radius = aim.itemDistance / MathUtils.clamp(view.zoom, CHARACTER_ZOOM_MIN, CHARACTER_ZOOM_MAX);
          anchor.parent!.parent!.getWorldQuaternion(anchorRotation);
          offset.set(0, radius * .06, radius).applyQuaternion(anchorRotation);
        } else if (view.camera === "Face") {
          const focus = findPreviewAnchor(aim.anchors, anchor, "villager-face-focus");
          const head = focus ?? findPreviewAnchor(aim.anchors, anchor, "head");
          if (head) {
            head.getWorldPosition(target);
            if (!focus) target.setY(target.y + .035 * scale);
          }
          (anchor.parent?.parent ?? anchor).getWorldQuaternion(anchorRotation);
          offset.set(0, radius * .13, radius).applyQuaternion(anchorRotation);
        } else {
          offset.set(radius * .14, radius * .08, radius);
        }
        position.copy(target).add(offset);
      }
    }
    if (aim.held) {
      position.copy(aim.heldPosition);
      target.copy(aim.heldTarget);
      if (garageView === "Cockpit") lensZoom = Math.min(1.2, zoom);
      if (wardrobe?.camera === "Whole car" && !insideCar) lensZoom = wardrobe.zoom;
    }
    let boundedCamera = false;
    if (!aim.held && (garageView !== "Showroom" || insideCar)) {
      const bounds = findPreviewAnchor(aim.anchors, scene, "garage-camera-envelope")?.userData.bounds;
      if (bounds && !bounds.isEmpty()) {
        aim.cameraMin.copy(bounds.min).addScalar(.30);
        aim.cameraMax.copy(bounds.max).addScalar(-.35);
        aim.cameraMin.y = Math.max(.30, aim.cameraMin.y);
        position.clamp(aim.cameraMin, aim.cameraMax);
        boundedCamera = true;
      }
    }
    const area = wardrobeOpen && !insideCar ? useCharacterPreviewStore.getState().viewport : null;
    const garageOffset = workshop && !wardrobeOpen && !closeShot && garageTab !== "abilities" ? .07 : 0;
    const offsetX = aim.held ? aim.heldOffset.x * width : area?.width ? width / 2 - (area.left + area.width / 2) : width * (sandboxPicker ? .15 : garageOffset);
    const offsetY = aim.held ? aim.heldOffset.y * height : area?.height ? height / 2 - (area.top + area.height / 2) : wardrobeOpen ? height * .055 : heroLayout && aspect < 1 ? -height * .04 : 0;
    initializedCamera.current = camera;
    const blend = firstFrame || reducedMotion ? 1 : 1 - Math.exp(-(closeShot ? 2.8 : 4.5) * Math.min(delta, .1));
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
    if (boundedCamera) camera.position.clamp(aim.cameraMin, aim.cameraMax);
    camera.quaternion.setFromRotationMatrix(lookAt.lookAt(camera.position, pivot, camera.up));
    const currentX = camera.view?.offsetX ?? offsetX;
    const currentY = camera.view?.offsetY ?? offsetY;
    const reframing = Math.abs(currentX - offsetX) > .01 || Math.abs(currentY - offsetY) > .01 || Math.abs(camera.zoom - lensZoom) > .0001;
    const cameraFov = aim.held ? aim.heldFov : fov;
    const cameraNear = aim.held ? aim.heldNear : near;
    const lensChanged = camera.fov !== cameraFov || camera.near !== cameraNear;
    camera.fov = cameraFov;
    camera.near = cameraNear;
    if (reframing || camera.view?.fullWidth !== width || camera.view?.fullHeight !== height) {
      camera.zoom = MathUtils.lerp(camera.zoom, lensZoom, blend);
      camera.setViewOffset(width, height, MathUtils.lerp(currentX, offsetX, blend), MathUtils.lerp(currentY, offsetY, blend), width, height);
    } else if (lensChanged) camera.updateProjectionMatrix();
    if (frameloop === "demand" && (!compact || stationary || reducedMotion) &&
      (reframing || camera.position.distanceToSquared(position) > .000001 || pivot.distanceToSquared(target) > .000001)) invalidate();
  }, -.25);
  return (
    <>
      <GarageEnvironment turntable={turntable} onPlatformReady={setPlatform} accentOverride={selectionAccent}
        allowLoad={!waitingForCar} onSettled={roomSettled} />
      {loadLabel && <PreviewLoadingStatus label={loadLabel} />}
      <PerspectiveCamera ref={cameraRef} makeDefault />

      <PreviewTurntable onReady={setTurntable} spin={!wardrobeOpen && !stationary && !reducedMotion && garageView === "Showroom"} locked={stationActive && garageView !== "Showroom"}>
        <group rotation={[0, Math.PI / 2, 0]}>
          <group ref={motion}>
            {driver && driverPose && <group position={driverPose.position} scale={driverPose.scale} rotation={[0, driverPose.yaw, 0]}>
              <group name="garage-driver-shadow"><PreviewContactShadow footprint={[.55, .46]} offset={[0, 0]} /></group>
              <GarageDriver choice={driver} previewPacks={wardrobeOpen} leanFit={vehicleFit?.lean}
                mirrorFit={vehicleFit?.mirror} cockpit={vehicleFit?.cockpit} />
            </group>}
            {vehicleId && <AssetBoundary
              key={vehicleId}
              fallback={<MissingVehicle model={vehicleId} onSettled={setSettledVehicle} cockpit={insideCar} />}
            >
              <Suspense fallback={null}>
                <VehiclePreviewModel platform={platform} model={vehicleId} driver={driver} previewPacks={wardrobeOpen}
                  motion={motion} onDriverFit={reportDriverFit} onSettled={setSettledVehicle} allowDriver={roomReady}
                  garageOpen={garageOpen} garageCameraAnchors={workshop && !wardrobeOpen} reducedMotion={reducedMotion}
                  summon={Boolean(settledVehicle && waitingForCar && !stationary && !reducedMotion)} />
              </Suspense>
            </AssetBoundary>}
          </group>
        </group>
      </PreviewTurntable>

    </>
  );
}
