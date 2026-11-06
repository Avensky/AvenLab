import {vehicleModelUrl} from './assetCatalog.ts';
import { useLiveAppearance } from "./cosmetics/useLiveAppearance";
import { useVehicleVisualAlignment } from "../hooks/useVehicleVisualAlignment";
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
import { Group, MathUtils } from "three";

import { applyBackendWheelPose, socketWheelIndex } from "./tools/vehicleVisualRig";
import { updateVehicleGlass } from "./tools/vehicleMaterials";
import {
  createSupraVisualRig,
  SUPRA_WHEEL_CORNERS,
} from "./tools/supraVisualRig";
import {
  useGameStore,
  useNetworkStore,
  useUIStore,
} from "../store";
import { useVehiclePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";

const MODEL_PATH = vehicleModelUrl('supra');

type SupraProps = PropsWithChildren<{
  entityId?: string;
}>;

export const Supra = forwardRef<Group, SupraProps>(function Supra(
  { children, entityId },
  ref,
) {
  const { scene } = useGLTF(MODEL_PATH);
  const vehicleGroupRef = useRef<Group>(null!);
  const vehicleVisualGroupRef = useRef<Group>(null!);
  useLiveAppearance(vehicleVisualGroupRef, "supra", entityId);
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

    const wheelDelta = Math.min(delta, 0.05);

    interpolated.wheels?.forEach((wheel) => {
      const index = socketWheelIndex(wheel.id);
      if (index < 0) return;

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

    const cameraMode = useGameStore.getState().camera;
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
