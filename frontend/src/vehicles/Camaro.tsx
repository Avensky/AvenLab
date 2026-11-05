import { measuredWheelHub, restorePartTransform } from "./tools/vehicleVisualRig";
import { useLiveAppearance } from "./cosmetics/useLiveAppearance";
import { useVehicleVisualAlignment } from "../hooks/useVehicleVisualAlignment";
// Camaro.tsx

import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { PropsWithChildren } from "react";
import { useGLTF } from "@react-three/drei";
import { Group, MathUtils, Matrix4, Mesh } from "three";
import {
  CAMARO_GLASS_PARTS as GLASS_PARTS,
  createVehicleMaterial,
} from "./tools/vehicleMaterials";
import type { Object3D } from "three";
import { useFrame } from "@react-three/fiber";
import { setupVehicleParts } from "./tools/setupVehicleParts";
import { useNetworkStore, useUIStore } from "../store";
import { useVehiclePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";

const MODEL_PATH = "/models/vehicles/camaro.glb";

// Chassis and wheel placement use backend poses; map data owns road alignment.
const DYNAMIC_WHEEL_GROUPS = new Set([
  "FL_WHEEL",
  "FR_WHEEL",
  "RL_WHEEL",
  "RR_WHEEL",
]);

type CamaroProps = PropsWithChildren<{
  entityId?: string;
}>;

type WheelVisualRig = {
  carrier: Group;
  spin: Group;
  previewMatrix: Matrix4;
};

function configureObjectMaterials(root: Object3D, isGlass: boolean) {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;

    object.material = Array.isArray(object.material)
      ? object.material.map((material) =>
          createVehicleMaterial(material, isGlass, "camaro"),
        )
      : createVehicleMaterial(object.material, isGlass, "camaro");
  });
}

export const Camaro = forwardRef<Group, CamaroProps>(function Camaro(
  { children, entityId },
  ref,
) {
  // Load the car model
  const { scene } = useGLTF(MODEL_PATH);

  // Refs for car group
  const vehicleGroupRef = useRef<Group>(null!);
  const vehicleVisualGroupRef = useRef<Group>(null!);

  const isVehiclePreview = useUIStore(
    (state) =>
      state.screen === "sandbox_setup" || state.screen === "signal_recon_setup",
  );

  // Allow parent components to access the car group ref
  useLiveAppearance(vehicleVisualGroupRef, "camaro", entityId);
  useImperativeHandle(ref, () => vehicleGroupRef.current, []);

  // One completed backend timeline drives both the body and world-space wheels.
  const { getInterpolated } = useVehiclePhysicsInterpolator(entityId);

  const { clonesByGroup, renderedGroups } = useMemo(() => {
    const setup = setupVehicleParts({
      scene,
      groups: [
        {
          name: "BODY",
          parts: [
            "SUNROOF",
            "SUNROOF_window",
            "FRONT_windows",
            "WINDSHIELD",
            "REAR_WINDOW",
            "RIGHT_QUARTER_WINDOW",
            "LEFT_QUARTER_WINDOW",
            "HEADLIGHT_LENS_LEFT",
            "HEADLIGHT_LENS_RIGHT",
            "TAILLIGHT_LENS_LEFT",
            "TAILLIGHT_LENS_RIGHT",
            "BODY",
            "REARVIEW_MIRROR",
            "GRILL",
            "GRILL_2",
            "CHASSIS",
            "FRONT_BUMPER",
            "FRONT_BUMPER_2",
            "HEADLIGHTS",
            "HEADLIGHTS_OFFSET",
            "BODY_badges",
            "BODY_DOOR_FRAMES",
            "REAR_BRAKES_LEFT",
            "REAR_BRAKES_RIGHT",
            "REAR_CAB",
            "REARBUMPER_badges",
            "REARBUMPER",
            "REARBUMPER_2",
            "REARBUMPER_lights",
            "REARBUMPER_LIP",
            "INTERIOR",
            "INTERIOR_2",
            "SEATS",
            "SEATS_2",
            "SEATS_3",
            "FRONT_CADDY",
            "DASHBOARD",
            "DASHBOARD_2",
            "NEEDLE_RPM",
            "NEEDLE_SPEED",
            "MUFFLERS",
            "EMPTY",
          ],
        },
        {
          name: "HOOD",
          parts: ["HOOD_VENT", "HOOD", "HOOD_2", "HOOD_3"],
        },
        {
          name: "TRUNK",
          parts: [
            "TRUNK",
            "TRUNK_WING",
            "CENTER_BREAK_LIGHT",
            "CHEVY_EMBLEM",
            "REAR_BRAKES_BOOT",
          ],
        },
        {
          name: "DOOR_LEFT",
          parts: [
            "DOOR_LEFT_LED",
            "DOOR_LEFT",
            "DOOR_LEFT_2",
            "DOOR_LEFT_3",
            "DOOR_LEFT_4",
            "DOOR_LEFT_5",
            "DOOR_LEFT_6",
            "DOOR_LEFT_7",
            "MIRROR_LEFT_GLASS",
            "MIRROR_LEFT",
            "MIRROR_LEFT_2",
            "MIRROR_LEFT_3",
            "LEFT_WINDOW",
          ],
        },
        {
          name: "DOOR_RIGHT",
          parts: [
            "DOOR_RIGHT_LED",
            "DOOR_RIGHT",
            "DOOR_RIGHT_2",
            "DOOR_RIGHT_3",
            "DOOR_RIGHT_4",
            "DOOR_RIGHT_5",
            "DOOR_RIGHT_6",
            "DOOR_RIGHT_7",
            "MIRROR_RIGHT",
            "MIRROR_RIGHT_2",
            "MIRROR_RIGHT_3",
            "MIRROR_RIGHT_GLASS",
            "RIGHT_WINDOWS",
          ],
        },
        {
          name: "FL_WHEEL",
          parts: ["FL_TIRE", "FL_RIM", "FL_ROTOR"],
        },
        {
          name: "FR_WHEEL",
          parts: ["FR_TIRE", "FR_RIM", "FR_ROTOR"],
        },
        {
          name: "RL_WHEEL",
          parts: ["RL_TIRE", "RL_RIM", "RL_ROTOR"],
        },
        {
          name: "RR_WHEEL",
          parts: ["RR_TIRE", "RR_RIM", "RR_ROTOR"],
        },
        {
          name: "STEERING_WHEEL",
          parts: [
            "STEERING_WHEEL_CENTER",
            "STEERING_WHEEL_SIDES",
            "STEERING_WHEEL_INSIDE",
            "STEERING_WHEEL_BOTTOM",
          ],
        },
      ],
    });

    // Clone materials per part so windows can remain transparent without
    // making the body transparent or mutating another Camaro instance.
    Object.values(setup.clonesByGroup).forEach((group) => {
      Object.entries(group as Record<string, Object3D>).forEach(
        ([partName, object]) => {
          configureObjectMaterials(object, GLASS_PARTS.has(partName));
        },
      );
    });

    return setup;
  }, [scene]);

  const wheelRigs = useMemo<WheelVisualRig[]>(() => {
    return [
      clonesByGroup["FL_WHEEL"],
      clonesByGroup["FR_WHEEL"],
      clonesByGroup["RL_WHEEL"],
      clonesByGroup["RR_WHEEL"],
    ].map((parts, index) => {
      const prefix = ["FL", "FR", "RL", "RR"][index];
      const rolling = Object.values(parts ?? {});
      for (const part of rolling) {
        const original = scene.getObjectByName(part.name);
        if (original) restorePartTransform(part, original);
      }
      const original = scene.getObjectByName(prefix + "_BRAKE_CALIPER");
      const fixed = [];
      if (original) {
        const caliper = original.clone(true);
        restorePartTransform(caliper, original);
        configureObjectMaterials(caliper, false);
        fixed.push(caliper);
      }
      return measuredWheelHub(parts?.[prefix + "_TIRE"], rolling, fixed);
    });
  }, [clonesByGroup, scene]);

  // Rolling and steering must use separate pivots or one transform will
  // overwrite the other.
  const wheelSpinAngles = useRef([0, 0, 0, 0]);

  useLayoutEffect(() => {
    for (const rig of wheelRigs) {
      // Restore the authored rest pose before the alignment layout
      // effect measures wheel centers. The first physics frame replaces
      // position/rotation with backend poses, as before.
      rig.previewMatrix.decompose(
        rig.carrier.position,
        rig.carrier.quaternion,
        rig.carrier.scale,
      );
      if (isVehiclePreview) {
        rig.spin.rotation.set(0, 0, 0);
      } else {
        // Runtime position/rotation come from backend world data.
        rig.carrier.scale.set(1, 1, 1);
      }
    }
    if (isVehiclePreview) {
      wheelSpinAngles.current.fill(0);
    }
  }, [isVehiclePreview, wheelRigs]);

  const alignmentWheels = useMemo(
    () => wheelRigs.map((rig) => rig.carrier),
    [wheelRigs],
  );
  useVehicleVisualAlignment(
    "camaro",
    entityId,
    vehicleVisualGroupRef,
    alignmentWheels,
    isVehiclePreview,
  );

  useFrame((_, delta) => {
    // Selection previews keep the transforms imported from Blender.
    if (isVehiclePreview) return;

    // get state on frame
    const networkState = useNetworkStore.getState();
    const localPlayerId = networkState.playerId;
    const id = entityId ?? localPlayerId;

    if (!id) return;

    const interp = getInterpolated(id);
    if (!interp) return;

    // Pose and wheel_speed come from the same buffered backend sample.
    // Mixing the newest raw wheels with a delayed body creates two clocks.
    const animatedWheels = interp.wheels ?? [];

    const group = vehicleGroupRef.current;

    // Update vehicle body
    group.position.set(...interp.position);
    group.quaternion.set(...interp.rotation);

    const indexById = {
      fl: 0,
      fr: 1,
      rl: 2,
      rr: 3,
    } as const;

    // Avoid a large spin jump after a slow frame or returning to the tab.
    const wheelDelta = Math.min(delta, 0.05);

    animatedWheels.forEach((wheel) => {
      const wheelId = wheel.id.toLowerCase() as keyof typeof indexById;
      const index = indexById[wheelId];
      if (index === undefined) return;

      const rig = wheelRigs[index];
      if (!rig) return;

      const wheelSpeed = wheel.wheel_speed ?? 0;

      rig.carrier.position.set(...wheel.position);
      rig.carrier.quaternion.set(...wheel.rotation);

      wheelSpinAngles.current[index] = MathUtils.euclideanModulo(
        wheelSpinAngles.current[index] + wheelSpeed * wheelDelta,
        Math.PI * 2,
      );
      rig.spin.rotation.x = wheelSpinAngles.current[index];
    });
  });

  {
    /* <Dust /> */
  }
  {
    /* <Skid /> */
  }
  return (
    <>
      <group ref={vehicleGroupRef}>
        <group ref={vehicleVisualGroupRef}>
          {Object.entries(renderedGroups)
            .filter(([groupName]) => !DYNAMIC_WHEEL_GROUPS.has(groupName))
            .map(([, renderedGroup]) => renderedGroup)}
        </group>

        {isVehiclePreview &&
          wheelRigs.map((rig, index) => (
            <primitive
              key={`camaro-preview-wheel-${index}`}
              object={rig.carrier}
            />
          ))}

        {children}
      </group>

      {!isVehiclePreview &&
        wheelRigs.map((rig, index) => (
          <primitive key={`camaro-wheel-${index}`} object={rig.carrier} />
        ))}
    </>
  );
});

export default Camaro;
