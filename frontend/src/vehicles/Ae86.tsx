import {popupAngle} from './tools/roadLamps';
import { measuredWheelHub, restorePartTransform } from "./tools/vehicleVisualRig";
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
import {
  Group,
  MathUtils,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";

import { useNetworkStore, useInputStore, useUIStore } from "../store";
import { useVehiclePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { hasFlag, VehicleFlags } from "../store/input/protocol/inputMasks";
import { setupVehicleParts } from "./tools/setupVehicleParts";

const MODEL_PATH = "/models/vehicles/ae86.glb";

// Runtime body and wheel poses are backend world coordinates. Exported model
// transforms stay in the asset; a road height mismatch is fixed in map data.

const PARTS = {
  root: "VEHICLE_ROOT",

  body: "Body",
  glass: "Glass",
  mirrors: "Mirrors",
  lightLenses: "LightLenses",
  headlightLenses: "HeadlightLenses",
  interior: "Interior",
  headlights: "Headlights",
  steeringWheel: "SteeringWheel",

  wheels: {
    fl: "Wheel_FL",
    fr: "Wheel_FR",
    rl: "Wheel_RL",
    rr: "Wheel_RR",
  },

  calipers: {
    fl: "Caliper_FL",
    fr: "Caliper_FR",
    rl: "Caliper_RL",
    rr: "Caliper_RR",
  },
} as const;

type Ae86Props = PropsWithChildren<{
  entityId?: string;
}>;

export const Ae86 = forwardRef<Group, Ae86Props>(function Ae86(
  { children, entityId },
  ref: React.Ref<Group>,
) {
  const { scene } = useGLTF(MODEL_PATH); //load the model and get the scene
  const isVehiclePreview = useUIStore(
    (state) =>
      state.screen === "sandbox_setup" || state.screen === "signal_recon_setup",
  );

  const vehicleGroupRef = useRef<Group>(null!);
  const vehicleVisualRef = useRef<Group>(null!);
  const headlightRef = useRef<Object3D | null>(null);

  // Allow parent components to access the car group ref
  useLiveAppearance(vehicleVisualRef, "ae86", entityId);
  useImperativeHandle(ref, () => vehicleGroupRef.current, []);

  // Headlight animation state
  const headlightRotation = useRef(0);

  // One completed backend timeline drives both the body and world-space wheels.
  const { getInterpolated } = useVehiclePhysicsInterpolator(entityId);

  const { clonesByGroup, renderedGroups } = useMemo(() => {
    const setup=setupVehicleParts({
      scene,
      model: "ae86",
      groups: [
        {
          name: "BODY",
          parts: [
            PARTS.body,
            PARTS.glass,
            PARTS.mirrors,
            PARTS.lightLenses,
            PARTS.interior,
            PARTS.headlights,
            PARTS.steeringWheel,
            PARTS.calipers.fl,
            PARTS.calipers.fr,
            PARTS.calipers.rl,
            PARTS.calipers.rr,
          ],
          transparent: [
            PARTS.glass,
            PARTS.mirrors,

          ],
          opacity: 0.9,
        },
        {
          name: "WHEEL_FL",
          parts: [PARTS.wheels.fl],
        },
        {
          name: "WHEEL_FR",
          parts: [PARTS.wheels.fr],
        },
        {
          name: "WHEEL_RL",
          parts: [PARTS.wheels.rl],
        },
        {
          name: "WHEEL_RR",
          parts: [PARTS.wheels.rr],
        },
      ],
    });
    const lid=setup.clonesByGroup.BODY?.[PARTS.headlights];
    const lens=scene.getObjectByName(PARTS.headlightLenses);
    if (lid && lens) {
      // The export put the lenses beside the hinged lids. Retain their rest
      // transform and make both panes follow the original pop-up pivot.
      lid.attach(lens.clone(true));
    }
    return setup;
  }, [scene]);

  const wheels = useMemo(() => {
    return (["fl", "fr", "rl", "rr"] as const).map(corner => {
      const name = PARTS.wheels[corner];
      const part = clonesByGroup["WHEEL_" + corner.toUpperCase()]?.[name];
      const source = scene.getObjectByName(name);
      if (!part || !source) return null;
      restorePartTransform(part, source);
      return measuredWheelHub(part, [part]).carrier;
    });
  }, [clonesByGroup, scene]);

  useVehicleVisualAlignment(
    "ae86",
    entityId,
    vehicleVisualRef,
    wheels,
    isVehiclePreview,
  );

  useEffect(() => {
    headlightRef.current = clonesByGroup.BODY?.[PARTS.headlights] ?? null;
  }, [clonesByGroup]);

  // Store the initial wheel rotations for later use
  const wheelRestRotations = useMemo(
    () => wheels.map((wheel) => wheel?.quaternion.clone() ?? null),
    [wheels],
  );

  // Backend wheel_speed is radians/second. Keep a continuous angle locally so
  // snapshot interpolation does not reset the visible wheel rotation.
  const wheelSpinAngles = useRef([0, 0, 0, 0]);
  const wheelBaseQuaternion = useRef(new Quaternion());
  const wheelSpinQuaternion = useRef(new Quaternion());
  const wheelAxle = useRef(new Vector3(1, 0, 0));

  useFrame((_, delta) => {
    // Selection previews use the transforms imported from the GLB. Do not let
    // a stale backend snapshot move the preview vehicle or its wheels.
    if (isVehiclePreview) return;

    const inputState = useInputStore.getState();
    const networkState = useNetworkStore.getState();

    const localPlayerId = networkState.playerId;
    const id = entityId ?? localPlayerId;
    if (!id) return;

    const isLocalPlayer = id === localPlayerId;

    const interp = getInterpolated(id);
    if (!interp) return;

    const input = inputState.input;

    const group = vehicleGroupRef.current;

    group.position.set(...interp.position);
    group.quaternion.set(...interp.rotation);

    // const wheelMap = {
    //   fl: wheels[0],
    //   fr: wheels[1],
    //   rl: wheels[2],
    //   rr: wheels[3],
    // } as const;

    const indexById = {
      fl: 0,
      fr: 1,
      rl: 2,
      rr: 3,
    } as const;

    const wheelDelta = Math.min(delta, 0.05);

    interp.wheels?.forEach((wheel) => {
      const wheelId = wheel.id.toLowerCase() as keyof typeof indexById;
      const index = indexById[wheelId];
      const wheelObject = wheels[index];
      const restRotation = wheelRestRotations[index];

      if (!wheelObject || !restRotation) return;

      wheelObject.position.set(...wheel.position);

      wheelSpinAngles.current[index] = MathUtils.euclideanModulo(
        wheelSpinAngles.current[index] + (wheel.wheel_speed ?? 0) * wheelDelta,
        Math.PI * 2,
      );

      // Backend owns wheel position and steering orientation.
      wheelBaseQuaternion.current.set(...wheel.rotation);
      wheelSpinQuaternion.current.setFromAxisAngle(
        wheelAxle.current,
        wheelSpinAngles.current[index],
      );

      wheelObject.quaternion
        .copy(wheelBaseQuaternion.current)
        .multiply(wheelSpinQuaternion.current)
        .multiply(restRotation);
    });

    const vehicleMask = isLocalPlayer
      ? input.vehicleMask
      : ((interp as { vehicle_mask?: number }).vehicle_mask ?? 0);
    const headlights = hasFlag(
      interp.vehicle_mask ?? vehicleMask,
      VehicleFlags.HEADLIGHTS,
    );
    const highBeam = Boolean((interp.cluster_mask ?? 0) & (1 << 3));
    headlightRotation.current = popupAngle(headlightRotation.current, headlights, highBeam, delta);
    if (headlightRef.current) {
      headlightRef.current.rotation.x = headlightRotation.current;
    }

  });

  return (
    <>
      <group ref={vehicleGroupRef}>
        <group ref={vehicleVisualRef}>{renderedGroups.BODY}</group>
        {isVehiclePreview &&
          wheels.map((wheel, i) =>
            wheel ? (
              <primitive key={`ae86-preview-wheel-${i}`} object={wheel} />
            ) : null,
          )}
        {children}
      </group>
      {!isVehiclePreview &&
        wheels.map((wheel, i) =>
          wheel ? <primitive key={`ae86-wheel-${i}`} object={wheel} /> : null,
        )}
    </>
  );
});

export default Ae86;
