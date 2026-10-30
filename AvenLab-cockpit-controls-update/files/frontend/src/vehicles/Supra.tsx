import { applyHeadlightBeam } from "./tools/headlightBeam";
import { useVehicleVisualAlignment } from "../hooks/useVehicleVisualAlignment";
import { useRenderSettingsStore } from "../store/presentation/renderSettingsStore";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { PropsWithChildren } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Group, MathUtils, SpotLight } from "three";

import { applyBackendWheelPose } from "./tools/vehicleVisualRig";
import { updateVehicleGlass } from "./tools/vehicleMaterials";
import {
  createSupraVisualRig,
  SUPRA_WHEEL_CORNERS,
} from "./tools/supraVisualRig";
import {
  useGameStore,
  useInputStore,
  useNetworkStore,
  useUIStore,
} from "../store";
import { useVehiclePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { hasFlag, VehicleFlags } from "../store/input/protocol/inputMasks";

const MODEL_PATH = "/models/vehicles/supra_2020.glb";

type SupraProps = PropsWithChildren<{
  entityId?: string;
}>;

export const Supra = forwardRef<Group, SupraProps>(function Supra(
  { children, entityId },
  ref,
) {
  const vehicleLights = useRenderSettingsStore((s) => s.vehicleLights);
  const { scene } = useGLTF(MODEL_PATH);
  const vehicleGroupRef = useRef<Group>(null!);
  const vehicleVisualGroupRef = useRef<Group>(null!);
  useImperativeHandle(ref, () => vehicleGroupRef.current, []);

  const isVehiclePreview = useUIStore(
    (state) =>
      state.screen === "sandbox_setup" || state.screen === "signal_recon_setup",
  );

  const rig = useMemo(() => createSupraVisualRig(scene), [scene]);
  const { vehicleVisualRoot, wheelAssemblies } = rig;
  useEffect(() => () => rig.dispose(), [rig]);

  const alignmentWheels = useMemo(
    () => wheelAssemblies.map((assembly) => assembly?.carrier ?? null),
    [wheelAssemblies],
  );
  useVehicleVisualAlignment(
    "supra",
    entityId,
    vehicleVisualGroupRef,
    alignmentWheels,
    isVehiclePreview,
  );

  useEffect(() => {
    const missing = SUPRA_WHEEL_CORNERS.filter(
      (_, index) => !wheelAssemblies[index],
    ).map((corner) => corner.toUpperCase());

    if (missing.length > 0) {
      console.warn(
        `[Supra 2020] Missing wheel assemblies: ${missing.join(", ")}`,
      );
    }
  }, [wheelAssemblies]);

  // One completed backend timeline drives both the body and world-space wheels.
  const { getInterpolated } = useVehiclePhysicsInterpolator(entityId);

  const blinkTimer = useRef(0);
  const blinkState = useRef(false);
  const leftLightRef = useRef<SpotLight | null>(null);
  const rightLightRef = useRef<SpotLight | null>(null);
  const leftTailRef = useRef<SpotLight | null>(null);
  const rightTailRef = useRef<SpotLight | null>(null);
  const flBlinkerRef = useRef<SpotLight | null>(null);
  const frBlinkerRef = useRef<SpotLight | null>(null);
  const rlBlinkerRef = useRef<SpotLight | null>(null);
  const rrBlinkerRef = useRef<SpotLight | null>(null);

  useEffect(() => {
    if (!vehicleLights) return;
    const vehicleVisualGroup = vehicleVisualGroupRef.current;
    if (!vehicleVisualGroup) return;

    const addSpot = (
      lightRef: { current: SpotLight | null },
      color: number,
      intensity: number,
      distance: number,
      position: [number, number, number],
      target: [number, number, number],
    ) => {
      const light = new SpotLight(color, intensity, distance, Math.PI / 6, 0.2);
      light.position.set(...position);
      light.target.position.set(...target);
      light.visible = false;
      lightRef.current = light;
      vehicleVisualGroup.add(light, light.target);
    };

    // The model faces +Z and is approximately 2.03 x 1.29 x 4.51 metres.
    addSpot(
      leftLightRef,
      0xffffff,
      5,
      42,
      [-0.67, 0.67, 2.18],
      [-0.55, -0.45, 6],
    );
    addSpot(
      rightLightRef,
      0xffffff,
      5,
      42,
      [0.67, 0.67, 2.18],
      [0.55, -0.45, 6],
    );
    addSpot(
      leftTailRef,
      0xff0000,
      3,
      9,
      [-0.72, 0.66, -2.12],
      [-0.72, 0.55, -4],
    );
    addSpot(
      rightTailRef,
      0xff0000,
      3,
      9,
      [0.72, 0.66, -2.12],
      [0.72, 0.55, -4],
    );
    addSpot(
      flBlinkerRef,
      0xffa500,
      12,
      17,
      [-0.86, 0.64, 2.12],
      [-1.0, 0.58, 4],
    );
    addSpot(frBlinkerRef, 0xffa500, 12, 17, [0.86, 0.64, 2.12], [1.0, 0.58, 4]);
    addSpot(
      rlBlinkerRef,
      0xffa500,
      12,
      17,
      [-0.84, 0.66, -2.1],
      [-1.0, 0.58, -4],
    );
    addSpot(
      rrBlinkerRef,
      0xffa500,
      12,
      17,
      [0.84, 0.66, -2.1],
      [1.0, 0.58, -4],
    );

    return () => {
      [
        leftLightRef,
        rightLightRef,
        leftTailRef,
        rightTailRef,
        flBlinkerRef,
        frBlinkerRef,
        rlBlinkerRef,
        rrBlinkerRef,
      ].forEach((lightRef) => {
        const light = lightRef.current;
        if (!light) return;
        light.parent?.remove(light);
        light.target.parent?.remove(light.target);
        light.dispose();
        lightRef.current = null;
      });
    };
  }, [vehicleLights]);

  const wheelSpinAngles = useRef([0, 0, 0, 0]);

  useFrame((_, delta) => {
    // Preview keeps the imported model pose and ignores stale game snapshots.
    if (isVehiclePreview) return;

    const networkState = useNetworkStore.getState();
    const localPlayerId = networkState.playerId;
    const resolvedEntityId = entityId ?? localPlayerId;
    if (!resolvedEntityId) return;

    const isLocalPlayer = resolvedEntityId === localPlayerId;

    const interpolated = getInterpolated(resolvedEntityId);
    if (!interpolated) return;

    const group = vehicleGroupRef.current;
    group.position.set(...interpolated.position);
    group.quaternion.set(...interpolated.rotation);

    const indexById = { fl: 0, fr: 1, rl: 2, rr: 3 } as const;
    const wheelDelta = Math.min(delta, 0.05);

    interpolated.wheels?.forEach((wheel) => {
      const id = wheel.id.toLowerCase() as keyof typeof indexById;
      const index = indexById[id];
      if (index === undefined) return;

      const assembly = wheelAssemblies[index];
      if (!assembly) return;

      wheelSpinAngles.current[index] = MathUtils.euclideanModulo(
        wheelSpinAngles.current[index] + (wheel.wheel_speed ?? 0) * wheelDelta,
        Math.PI * 2,
      );

      applyBackendWheelPose(
        assembly,
        wheel.position,
        wheel.rotation,
        0, // Steering is already included in the backend quaternion.
        wheelSpinAngles.current[index],
      );
    });

    const inputState = useInputStore.getState();
    const gameState = useGameStore.getState();
    const vehicleMask = isLocalPlayer
      ? inputState.input.vehicleMask
      : ((interpolated as { vehicle_mask?: number }).vehicle_mask ?? 0);
    const headlights = hasFlag(
      interpolated.vehicle_mask ?? vehicleMask,
      VehicleFlags.HEADLIGHTS,
    );
    const highBeam = Boolean((interpolated.cluster_mask ?? 0) & (1 << 3));
    const hazards = hasFlag(vehicleMask, VehicleFlags.HAZARDS);
    const blinkerLeft =
      hasFlag(vehicleMask, VehicleFlags.BLINKER_LEFT) && !hazards;
    const blinkerRight =
      hasFlag(vehicleMask, VehicleFlags.BLINKER_RIGHT) && !hazards;

    blinkTimer.current += delta;
    if (blinkTimer.current >= 0.5) {
      blinkTimer.current = 0;
      blinkState.current = !blinkState.current;
    }
    const blinkOn = blinkState.current;

    applyHeadlightBeam(leftLightRef.current, headlights, highBeam);
    applyHeadlightBeam(rightLightRef.current, headlights, highBeam);
    const braking = isLocalPlayer && inputState.controls.braking;
    if (leftTailRef.current) leftTailRef.current.visible = braking;
    if (rightTailRef.current) rightTailRef.current.visible = braking;
    if (flBlinkerRef.current)
      flBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn;
    if (frBlinkerRef.current)
      frBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn;
    if (rlBlinkerRef.current)
      rlBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn;
    if (rrBlinkerRef.current)
      rrBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn;

    const cameraMode = gameState.camera;
    const isFirstPerson = isLocalPlayer && cameraMode === "FIRST_PERSON";
    const interpolation = Math.min(delta / 3, 1);
    updateVehicleGlass(rig.glassMaterials, isFirstPerson, interpolation);
  });

  return (
    <>
      <group ref={vehicleGroupRef}>
        <group ref={vehicleVisualGroupRef}>
          <primitive object={vehicleVisualRoot} />
          {children}
        </group>

        {isVehiclePreview &&
          wheelAssemblies.map((assembly, index) =>
            assembly ? (
              <primitive
                key={`supra-preview-wheel-${index}`}
                object={assembly.carrier}
              />
            ) : null,
          )}
      </group>

      {!isVehiclePreview &&
        wheelAssemblies.map((assembly, index) =>
          assembly ? (
            <primitive key={`supra-wheel-${index}`} object={assembly.carrier} />
          ) : null,
        )}
    </>
  );
});

export default Supra;
