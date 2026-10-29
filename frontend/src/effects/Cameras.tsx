import { PerspectiveCamera, OrbitControls } from '@react-three/drei'
import {InspectionCameraControls} from "../components/InspectionCameraControls";
import {specialCameraPreset} from "../utils/drivingViews";
import { RotatingCamera } from './RotatingCamera'
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls as ThreeOrbitControls } from 'three-stdlib';
import { usePreferencesStore } from "../store/preferencesStore";
import { useGameStore } from '../store/gameStore';
import { useUIStore } from '../store/uiStore';
import { useNetworkStore } from '../store/networkStore';
import { PlayerCameraControls } from "../components/PlayerCameraControls";
import { beginVehicleRenderFrame, releaseVehicleRenderFrameClock } from "../hooks/usePhysicsInterpolator";


type VehicleCameraPreset = {
  offset: [number, number, number];
  targetOffset: [number, number, number];
  positionSpeed: number;
  targetSpeed: number;
};

const DEFAULT_CAMERA_PRESET: VehicleCameraPreset = {
  offset: [0, 2.3, -5.8],
  targetOffset: [0, 1.1, 6.0],
  positionSpeed: 7,
  targetSpeed: 10,
};

const VEHICLE_CAMERA_PRESETS: Record<string, VehicleCameraPreset> = {
  ae86: {
    offset: [0, 2.2, -5.4],
    targetOffset: [0, 1.0, 5.5],
    positionSpeed: 7,
    targetSpeed: 10,
  },
  brz: {
    offset: [0, 2.25, -5.6],
    targetOffset: [0, 1.05, 5.8],
    positionSpeed: 7,
    targetSpeed: 10,
  },
  frs: {
    offset: [0, 2.25, -5.6],
    targetOffset: [0, 1.05, 5.8],
    positionSpeed: 7,
    targetSpeed: 10,
  },
  camaro: {
    offset: [0, 2.6, -6.4],
    targetOffset: [0, 1.2, 6.5],
    positionSpeed: 7,
    targetSpeed: 10,
  },
  supra: {
    offset: [0, 2.25, -5.7],
    targetOffset: [0, 1.05, 6.0],
    positionSpeed: 7,
    targetSpeed: 10,
  },
  tank: {
    offset: [0, 5.0, -11.0],
    targetOffset: [0, 2.0, 8.0],
    positionSpeed: 5,
    targetSpeed: 7,
  },
};

function normalizeVehicleId(vehicleId?: string | null) {
  return vehicleId?.trim().toLowerCase().replaceAll("_", "-") ?? "";
}

function cameraPresetForVehicle(vehicleId?: string | null): VehicleCameraPreset {
  const id = normalizeVehicleId(vehicleId);

  if (id === "toyota-ae86") return VEHICLE_CAMERA_PRESETS.ae86;
  if (["subaru-brz", "fr-s", "scion-frs", "scion-fr-s", "gt86", "toyota-gt86"].includes(id)) {
    return VEHICLE_CAMERA_PRESETS.brz;
  }
  if (id === "camaro-2017") return VEHICLE_CAMERA_PRESETS.camaro;
  if (["supra-2020", "gr-supra", "toyota-supra", "a90", "toyota-a90"].includes(id)) {
    return VEHICLE_CAMERA_PRESETS.supra;
  }

  return VEHICLE_CAMERA_PRESETS[id] ?? DEFAULT_CAMERA_PRESET;
}

export default function Cameras() {
  const fov = usePreferencesStore((s) => s.fov);
  const reducedMotion = usePreferencesStore((s) => s.reducedMotion);
  const overlay = useUIStore((s) => s.overlay);
  const screen = useUIStore((state) => state.screen);
  const camMode = useGameStore((state) => state.camera);
  const editor = useGameStore((state) => state.editor);
  const playerId = useNetworkStore((state) => state.playerId);
  const playerVehicleId = useNetworkStore((state) =>
    state.snapshot?.entities.find((entity) => entity.id === state.playerId)?.vehicle_id ?? null
  );
  const playerCameraPreset = camMode==="FIRST_PERSON"||camMode==="BIRDS_EYE"?specialCameraPreset(camMode,playerVehicleId):{...cameraPresetForVehicle(playerVehicleId),worldAligned:false};
  const controlsRef = useRef<ThreeOrbitControls | null>(null);
  // Run before camera (-1) and model (0). Keep the frame clock alive in
  // editor mode too. Negative priority retains automatic R3F rendering.
  useFrame(() => beginVehicleRenderFrame(), -100);
  useEffect(() => releaseVehicleRenderFrameClock, []);

  if(overlay==="world_builder")return null;

  if (editor && screen==="sandbox") {
    return (
      <><PerspectiveCamera makeDefault fov={fov} near={.05}/><InspectionCameraControls playerId={playerId} enabled={overlay===null}/></>
    );
  }

  const isGallery =
    camMode === "GALLERY" &&
    (
        screen === "sandbox_setup" ||
        screen === "signal_recon_setup"
    );

  const isDriving =
    screen === "sandbox" &&
    !editor &&
    (camMode === "DEFAULT" || camMode === "FIRST_PERSON" || camMode === "BIRDS_EYE");
  return (
    <>
      <PerspectiveCamera makeDefault fov={fov} near={.05} position={[0, 7, 12]} />
      <PlayerCameraControls
        worldAligned={playerCameraPreset.worldAligned}
        maxYaw={camMode==="BIRDS_EYE"?0:Math.PI*.65} maxPitch={camMode==="BIRDS_EYE"?0:.45}
        playerId={playerId}
        enabled={isDriving && overlay === null}
        offset={playerCameraPreset.offset}
        targetOffset={playerCameraPreset.targetOffset}
        positionSpeed={playerCameraPreset.positionSpeed}
        targetSpeed={playerCameraPreset.targetSpeed}
      />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={isGallery}        
        maxPolarAngle={Math.PI / 2 - 0.05}
        minPolarAngle={0}
        enableZoom
        minDistance={3}
        maxDistance={13}
      />
      {
        (isGallery && !reducedMotion) && (
        <RotatingCamera
          orbitRef={controlsRef}
          radius={4.5}
          speed={0.2}
          height={2.2}
          resumeDuration={5}
        />
      )}
    </>
  );
}
