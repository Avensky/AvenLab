import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { PropsWithChildren } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Color,
  Group,
  MathUtils,
  MeshPhysicalMaterial,
  SpotLight,
  Vector3,
} from "three";

import { sharedGlassMaterial } from "./tools/createGlassMaterialFactory";
import {
  applyBackendWheelPose,
  applyDynamicMaterial,
  extractWheelAssembly,
  isBrakeCaliperPart,
  type WheelAssemblySpec,
} from "./tools/vehicleVisualRig";
import {
  useGameStore,
  useInputStore,
  useNetworkStore,
  useUIStore,
} from "../store";
import { usePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { hasFlag, VehicleFlags } from "../store/tools/inputMasks";

const MODEL_PATH = "/models/vehicles/supra_2020.glb";
const VEHICLE_ROOT_NAME = "VEHICLE_ROOT";
const DEFAULT_VISUAL_Y_OFFSET = -0.60;

type SupraProps = PropsWithChildren<{
  entityId?: string;
  /** Moves only the rendered chassis/lights, never the Rapier body or wheels. */
  visualYOffset?: number;
}>;

// The source model labels its positive-X side as left. Backend left is
// negative X, so the imported R assemblies intentionally map to backend L.
const WHEEL_SPECS: readonly WheelAssemblySpec[] = [
  {
    corner: "fl",
    rootNames: ["Calliper Front R", "Caliper Front R"],
    isFixedPart: isBrakeCaliperPart,
  },
  {
    corner: "fr",
    rootNames: ["Calliper Front L", "Caliper Front L"],
    isFixedPart: isBrakeCaliperPart,
  },
  {
    corner: "rl",
    rootNames: ["Calliper Rear R", "Caliper Rear R"],
    isFixedPart: isBrakeCaliperPart,
  },
  {
    corner: "rr",
    rootNames: ["Calliper Rear L", "Caliper Rear L"],
    isFixedPart: isBrakeCaliperPart,
  },
];

function isSupraGlassMaterial(materialName: string) {
  const name = materialName.toLowerCase();

  // Do not replace the window surround or red lamp glass slots that share the
  // same multi-material mesh with the actual windows.
  if (name.includes("surr") || name.includes("red_glass")) return false;
  return name.includes("window_material");
}

export const Supra = forwardRef<Group, SupraProps>(function Supra(
  {
    children,
    entityId,
    visualYOffset = DEFAULT_VISUAL_Y_OFFSET,
  },
  ref
) {
  const { scene } = useGLTF(MODEL_PATH);
  const camera = useThree((state) => state.camera);
  const vehicleGroupRef = useRef<Group>(null!);
  const vehicleVisualGroupRef = useRef<Group>(null!);
  useImperativeHandle(ref, () => vehicleGroupRef.current, []);

  const isVehiclePreview = useUIStore(
    (state) =>
      state.screen === "sandbox_setup" ||
      state.screen === "signal_recon_setup"
  );

  // Three.js materials are mutable external objects. Keep this instance in a
  // ref so React does not treat it as an immutable value returned by a hook.
  // Each vehicle still gets its own glass instance, preventing first-person
  // transparency from affecting remote players.
  const glassMaterialRef = useRef<MeshPhysicalMaterial | null>(null);
  if (glassMaterialRef.current === null) {
    glassMaterialRef.current = sharedGlassMaterial.clone();
  }
  const tintFirstPerson = useMemo(() => new Color(0xffffff), []);
  const tintExterior = useMemo(() => new Color(0x556677), []);

  useEffect(() => {
    const glassMaterial = glassMaterialRef.current;
    return () => glassMaterial?.dispose();
  }, []);

  const { vehicleVisualRoot, wheelAssemblies } = useMemo(() => {
    const sourceRoot = scene.getObjectByName(VEHICLE_ROOT_NAME) ?? scene;
    const root = sourceRoot.clone(true);

    const assemblies = WHEEL_SPECS.map((spec) =>
      extractWheelAssembly(root, spec)
    );

    return {
      vehicleVisualRoot: root,
      wheelAssemblies: assemblies,
    };
  }, [scene]);

  useEffect(() => {
    const glassMaterial = glassMaterialRef.current;
    if (!glassMaterial) return;
    applyDynamicMaterial(
      vehicleVisualRoot,
      glassMaterial,
      isSupraGlassMaterial
    );
  }, [vehicleVisualRoot]);

  useEffect(() => {
    const missing = WHEEL_SPECS.filter(
      (_, index) => !wheelAssemblies[index]
    ).map((spec) => spec.corner.toUpperCase());

    if (missing.length > 0) {
      console.warn(
        `[Supra 2020] Missing wheel assemblies: ${missing.join(", ")}`
      );
    }
  }, [wheelAssemblies]);

  const snapshot = useNetworkStore((state) => state.snapshot);
  const { setSnapshot, getInterpolated } = usePhysicsInterpolator(100);

  useEffect(() => {
    if (!snapshot) return;
    for (const entity of snapshot.entities) setSnapshot(entity.id, entity);
  }, [snapshot, setSnapshot]);

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
    const vehicleVisualGroup = vehicleVisualGroupRef.current;
    if (!vehicleVisualGroup) return;

    const addSpot = (
      lightRef: { current: SpotLight | null },
      color: number,
      intensity: number,
      distance: number,
      position: [number, number, number],
      target: [number, number, number]
    ) => {
      const light = new SpotLight(
        color,
        intensity,
        distance,
        Math.PI / 6,
        0.2
      );
      light.position.set(...position);
      light.target.position.set(...target);
      light.visible = false;
      lightRef.current = light;
      vehicleVisualGroup.add(light, light.target);
    };

    // The model faces +Z and is approximately 2.03 x 1.29 x 4.51 metres.
    addSpot(leftLightRef, 0xffffff, 5, 42, [-0.67, 0.67, 2.18], [-0.55, -0.45, 6]);
    addSpot(rightLightRef, 0xffffff, 5, 42, [0.67, 0.67, 2.18], [0.55, -0.45, 6]);
    addSpot(leftTailRef, 0xff0000, 3, 9, [-0.72, 0.66, -2.12], [-0.72, 0.55, -4]);
    addSpot(rightTailRef, 0xff0000, 3, 9, [0.72, 0.66, -2.12], [0.72, 0.55, -4]);
    addSpot(flBlinkerRef, 0xffa500, 12, 17, [-0.86, 0.64, 2.12], [-1.0, 0.58, 4]);
    addSpot(frBlinkerRef, 0xffa500, 12, 17, [0.86, 0.64, 2.12], [1.0, 0.58, 4]);
    addSpot(rlBlinkerRef, 0xffa500, 12, 17, [-0.84, 0.66, -2.1], [-1.0, 0.58, -4]);
    addSpot(rrBlinkerRef, 0xffa500, 12, 17, [0.84, 0.66, -2.1], [1.0, 0.58, -4]);

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
  }, []);

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
        Math.PI * 2
      );

      applyBackendWheelPose(
        assembly,
        wheel.position,
        wheel.rotation,
        wheel.steer_angle ?? 0,
        wheelSpinAngles.current[index]
      );
    });

    const inputState = useInputStore.getState();
    const gameState = useGameStore.getState();
    const vehicleMask = isLocalPlayer
      ? inputState.input.vehicleMask
      : (interpolated as { vehicle_mask?: number }).vehicle_mask ?? 0;
    const headlights = hasFlag(vehicleMask, VehicleFlags.HEADLIGHTS);
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

    if (leftLightRef.current) leftLightRef.current.visible = headlights;
    if (rightLightRef.current) rightLightRef.current.visible = headlights;
    const braking = isLocalPlayer && inputState.controls.braking;
    if (leftTailRef.current) leftTailRef.current.visible = braking;
    if (rightTailRef.current) rightTailRef.current.visible = braking;
    if (flBlinkerRef.current) flBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn;
    if (frBlinkerRef.current) frBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn;
    if (rlBlinkerRef.current) rlBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn;
    if (rrBlinkerRef.current) rrBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn;

    const cameraMode = gameState.camera;
    if (
      isLocalPlayer &&
      !gameState.editor &&
      (cameraMode === "FIRST_PERSON" ||
        cameraMode === "DEFAULT" ||
        cameraMode === "BIRDS_EYE")
    ) {
      const offset = new Vector3();
      if (cameraMode === "FIRST_PERSON") {
        offset.set(-0.25, 1.02 + visualYOffset, 0.25);
      }
      if (cameraMode === "DEFAULT") offset.set(0, 2.1, -4.5);
      if (cameraMode === "BIRDS_EYE") offset.set(0, 7.5, -12);
      offset.applyQuaternion(group.quaternion).add(group.position);
      camera.position.lerp(offset, delta * 5);

      const target = group.position.clone();
      target.y += 1.05 + visualYOffset;
      camera.lookAt(target);
    }

    const isFirstPerson = isLocalPlayer && cameraMode === "FIRST_PERSON";
    const interpolation = Math.min(delta / 3, 1);
    const glassMaterial = glassMaterialRef.current;
    if (!glassMaterial) return;

    glassMaterial.opacity = MathUtils.lerp(
      glassMaterial.opacity,
      isFirstPerson ? 0.08 : 0.42,
      interpolation
    );
    glassMaterial.ior = MathUtils.lerp(
      glassMaterial.ior,
      isFirstPerson ? 1 : 1.45,
      interpolation
    );
    glassMaterial.color.lerp(
      isFirstPerson ? tintFirstPerson : tintExterior,
      interpolation
    );
    glassMaterial.needsUpdate = true;
  });

  return (
    <>
      <group ref={vehicleGroupRef}>
        <group
          ref={vehicleVisualGroupRef}
          position-y={isVehiclePreview ? 0 : visualYOffset}
        >
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
            ) : null
          )}
      </group>

      {!isVehiclePreview &&
        wheelAssemblies.map((assembly, index) =>
          assembly ? (
            <primitive
              key={`supra-wheel-${index}`}
              object={assembly.carrier}
            />
          ) : null
        )}
    </>
  );
});

useGLTF.preload(MODEL_PATH);
export default Supra;
