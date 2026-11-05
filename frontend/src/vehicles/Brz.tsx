import { measuredWheelHub } from "./tools/vehicleVisualRig";
import { useLiveAppearance } from "./cosmetics/useLiveAppearance";
import { useVehicleVisualAlignment } from "../hooks/useVehicleVisualAlignment";
// Brz.tsx

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
  Mesh,
  Color,
  MathUtils,
  Quaternion,
  Vector3,
  Object3D,
} from "three";
import { sharedGlassMaterial } from "./tools/createGlassMaterialFactory";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";

import {
  useNetworkStore,
  useGameStore,
  useUIStore,
} from "../store";
import { useVehiclePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";

const MODEL_PATH = "/models/vehicles/brz.glb";

// Use the exported asset transform beneath the backend body pose. There is
// no runtime body-height correction: road alignment belongs to the map data.

const BRZ_ROOT_NAME = "VEHICLE_ROOT";

// Support the original BRZ names and the newer naming convention used by the
// AE86 export. The first matching object is used for each wheel.
const BRZ_WHEEL_NAMES = {
  fr: ["WHEEL_FR", "Wheel_FR", "FR_WHEEL"],
  fl: ["WHEEL_FL", "Wheel_FL", "FL_WHEEL"],
  rr: ["WHEEL_RR", "Wheel_RR", "RR_WHEEL"],
  rl: ["WHEEL_RL", "Wheel_RL", "RL_WHEEL"],
} as const;

function findFirstNamedObject(
  root: Object3D,
  names: readonly string[],
): Object3D | null {
  for (const name of names) {
    const exact = root.getObjectByName(name);
    if (exact) return exact;
  }

  const lowerNames = new Set(names.map((name) => name.toLowerCase()));
  let match: Object3D | null = null;

  root.traverse((object) => {
    if (!match && lowerNames.has(object.name.toLowerCase())) {
      match = object;
    }
  });

  return match;
}

function extractWheel(root: Object3D, names: readonly string[]) {
  const wheel = findFirstNamedObject(root, names);
  if (!wheel) return null;

  let tire: Object3D | undefined;
  wheel.traverse(part => {
    if (part instanceof Mesh && !Array.isArray(part.material) && /tyre|tire/i.test(part.material.name)) tire = part;
  });
  return measuredWheelHub(tire ?? wheel, [wheel]).carrier;
}

type BrzProps = PropsWithChildren<{
  entityId?: string;
}>;

export const Brz = forwardRef<Group, BrzProps>(function Brz(
  { children, entityId },
  ref,
) {
  // Tint colors for first-person and exterior views
  const tintFirstPerson = new Color(0xffffff); // Clear tint for first-person view
  const tintExterior = new Color(0x556677); // Blue-gray tint (customize as needed)

  const { scene } = useGLTF(MODEL_PATH); // Load the car model
  const isVehiclePreview = useUIStore(
    (state) =>
      state.screen === "sandbox_setup" || state.screen === "signal_recon_setup",
  );
  const vehicleGroupRef = useRef<Group>(null!); // Refs for car group
  const visualGroupRef = useRef<Group>(null!);

  // Allow parent components to access the car group ref
  useLiveAppearance(visualGroupRef, "brz", entityId);
  useImperativeHandle(ref, () => vehicleGroupRef.current, []);

  // One completed backend timeline drives both the body and world-space wheels.
  const { getInterpolated } = useVehiclePhysicsInterpolator(entityId);

  const { vehicleVisualRoot, wheels } = useMemo(() => {
    // Clone the complete hierarchy instead of rebuilding a partial model
    // from a flat list of object names. This keeps every child beneath the
    // Blender VEHICLE_ROOT visible.
    const sourceRoot = scene.getObjectByName(BRZ_ROOT_NAME) ?? scene;
    const root = sourceRoot.clone(true);

    const extractedWheels = [
      extractWheel(root, BRZ_WHEEL_NAMES.fl),
      extractWheel(root, BRZ_WHEEL_NAMES.fr),
      extractWheel(root, BRZ_WHEEL_NAMES.rl),
      extractWheel(root, BRZ_WHEEL_NAMES.rr),
    ];

    return {
      vehicleVisualRoot: root,
      wheels: extractedWheels,
    };
  }, [scene]);

  useVehicleVisualAlignment(
    "brz",
    entityId,
    visualGroupRef,
    wheels,
    isVehiclePreview,
  );

  useEffect(() => {
    const missingWheelNames = (["FL", "FR", "RL", "RR"] as const).filter(
      (_, index) => !wheels[index],
    );

    if (missingWheelNames.length > 0) {
      console.warn(
        `[BRZ] Missing wheel roots: ${missingWheelNames.join(", ")}.`,
        "Expected one of:",
        BRZ_WHEEL_NAMES,
      );
    }
  }, [wheels]);
  // Preserve every wheel's imported GLB orientation. Backend wheel_speed is
  // radians/second, so integrate it into a continuous visual rotation.
  const wheelRestRotations = useMemo(
    () => wheels.map((wheel) => wheel?.quaternion.clone() ?? null),
    [wheels],
  );
  const wheelSpinAngles = useRef([0, 0, 0, 0]);
  const wheelBaseQuaternion = useRef(new Quaternion());
  const wheelSpinQuaternion = useRef(new Quaternion());
  const wheelAxle = useRef(new Vector3(1, 0, 0));

  useFrame((_, delta) => {
    // Keep the selection model in its imported GLB pose. A previous game
    // may still have an interpolated snapshot for this player.
    if (isVehiclePreview) return;

    // get state on frame
    const gameState = useGameStore.getState();
    const networkState = useNetworkStore.getState();
    const localPlayerId = networkState.playerId;
    const id = entityId ?? localPlayerId;

    if (!id) return;

    const interp = getInterpolated(id);
    if (!interp) return;

    const camMode = gameState.camera;

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

    // Avoid a large animation jump after a slow frame or tab switch.
    const wheelDelta = Math.min(delta, 0.05);

    interp.wheels?.forEach((wheel) => {
      const wheelId = wheel.id.toLowerCase() as keyof typeof indexById;
      const index = indexById[wheelId];
      if (index === undefined) return;

      const wheelObject = wheels[index];
      const restRotation = wheelRestRotations[index];
      if (!wheelObject || !restRotation) return;

      wheelObject.position.set(...wheel.position);

      wheelSpinAngles.current[index] = MathUtils.euclideanModulo(
        wheelSpinAngles.current[index] + (wheel.wheel_speed ?? 0) * wheelDelta,
        Math.PI * 2,
      );

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

    if (id === localPlayerId) {
      const isFirstPerson = camMode === "FIRST_PERSON";
      const targetOpacity = isFirstPerson ? 0.1 : 0.4;
      const targetIOR = isFirstPerson ? 1.0 : 6.5;
      const targetColor = isFirstPerson ? tintFirstPerson : tintExterior;
      const transitionSpeed = 3.0;
      const t = delta / transitionSpeed;

      sharedGlassMaterial.opacity = MathUtils.lerp(
        sharedGlassMaterial.opacity,
        targetOpacity,
        t,
      );

      sharedGlassMaterial.ior = MathUtils.lerp(
        sharedGlassMaterial.ior,
        targetIOR,
        t,
      );
      sharedGlassMaterial.color.lerp(targetColor, t);
    }
  });

  return (
    <>
      <group ref={vehicleGroupRef}>
        <group ref={visualGroupRef}>
          <primitive object={vehicleVisualRoot} />
        </group>
        {isVehiclePreview &&
          wheels.map((wheel, i) =>
            wheel ? (
              <primitive key={`brz-preview-wheel-${i}`} object={wheel} />
            ) : null,
          )}
        {children}
      </group>
      {!isVehiclePreview &&
        wheels.map((wheel, i) =>
          wheel ? <primitive key={`brz-wheel-${i}`} object={wheel} /> : null,
        )}
    </>
  );
});

export default Brz;
