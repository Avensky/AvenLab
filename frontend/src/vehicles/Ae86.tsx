import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, } from "react";
import type { PropsWithChildren } from "react";
import { Group, MathUtils, Object3D, Quaternion, SpotLight, Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";

import { useNetworkStore, useInputStore, useGameStore, useUIStore } from "../store";
import { usePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { hasFlag, VehicleFlags } from "../store/tools/inputMasks";
import { setupVehicleParts } from "./tools/setupVehicleParts";

const MODEL_PATH = "/models/vehicles/ae86.glb";

// The exported body origin is on the bottom of the chassis, while the backend
// rigid-body pose is the center of its 0.70 m-tall box collider. Move only the
// visual body down by the collider half-height; the world-space wheel poses
// from the backend remain unchanged.
const CHASSIS_VISUAL_OFFSET_Y = -0.50;

const PARTS = {
  root: "VEHICLE_ROOT",

  body: "Body",
  glass: "Glass",
  mirrors: "Mirror",
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
  ref: React.Ref<Group>
) {
  const { scene } = useGLTF(MODEL_PATH);            //load the model and get the scene
  const camera = useThree((state) => state.camera);
  const isVehiclePreview = useUIStore(
    (state) =>
      state.screen === "sandbox_setup" ||
      state.screen === "signal_recon_setup"
  );


  const vehicleGroupRef = useRef<Group>(null!);
  const headlightRef = useRef<Object3D | null>(null);

  // Allow parent components to access the car group ref
  useImperativeHandle(ref, () => vehicleGroupRef.current, [])

  // Headlight animation state
  const headlightRotation = useRef(0);

  // Simulate hazard lights
  const blinkTimer = useRef(0);
  const blinkState = useRef(false);

  // Refs for individual lights
  const leftLightRef = useRef<SpotLight | null>(null);
  const rightLightRef = useRef<SpotLight | null>(null);
  const leftTailRef = useRef<SpotLight | null>(null);
  const rightTailRef = useRef<SpotLight | null>(null);
  const flBlinkerRef = useRef<SpotLight | null>(null);
  const frBlinkerRef = useRef<SpotLight | null>(null);
  const rlBlinkerRef = useRef<SpotLight | null>(null);
  const rrBlinkerRef = useRef<SpotLight | null>(null);

  const snapshot = useNetworkStore((s) => s.snapshot);
  const { setSnapshot, getInterpolated } = usePhysicsInterpolator(100);

  useEffect(() => {
    if (!snapshot) return;
    for (const entity of snapshot.entities) { setSnapshot(entity.id, entity); }
  }, [snapshot, setSnapshot]);

  const { clonesByGroup, renderedGroups } = useMemo(() => {
    return setupVehicleParts({
      scene,
      groups: [
        {
          name: "BODY",
          parts: [
            PARTS.body,
            PARTS.glass,
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
            PARTS.lightLenses,
            PARTS.headlightLenses,
          ],
          opacity: .9,
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
  }, [scene]);

  const wheels = useMemo(() => {
    return [
      clonesByGroup.WHEEL_FR?.[PARTS.wheels.fr] ?? null,
      clonesByGroup.WHEEL_FL?.[PARTS.wheels.fl] ?? null,
      clonesByGroup.WHEEL_RR?.[PARTS.wheels.rr] ?? null,
      clonesByGroup.WHEEL_RL?.[PARTS.wheels.rl] ?? null,
    ];
  }, [clonesByGroup]);

  // Log the body parts and headlights when they are available
  useEffect(() => {
    headlightRef.current = clonesByGroup.BODY?.[PARTS.headlights] ?? null;

    // console.log("[ae86 used] body parts:", Object.keys(clonesByGroup.BODY ?? {}));
    // console.log("[ae86 used] headlights:", headlightRef.current?.name);
    // console.log("[ae86 used] wheels:", wheels.map((w) => w?.name));
  }, [clonesByGroup, wheels]);

  // light setup
  useEffect(() => {
    const addSpot = (
      refObj: { current: SpotLight | null },
      color: number,
      intensity: number,
      distance: number,
      position: [number, number, number],
      target: [number, number, number]
    ) => {
      if (!vehicleGroupRef.current) return;

      const light = new SpotLight(color, intensity, distance, Math.PI / 6, 0.2);
      light.position.set(...position);
      light.target.position.set(...target);
      light.visible = false;
      refObj.current = light;

      vehicleGroupRef.current.add(light);
      vehicleGroupRef.current.add(light.target);
    };

    // addSpot( SpotLight, color, intensity, distance, 
    // position: [X, Y, Z],
    // target: [X, Y, Z])

    // Add headlights
    addSpot(leftLightRef, 0xffffff, 12, 40, [0.5, 0.7, 1.9], [0.4, -0.6, 4]);       // FL
    addSpot(rightLightRef, 0xffffff, 12, 40, [-0.55, 0.7, 1.9], [-0.4, -0.6, 4]);   // FR

    // Add tail lights
    addSpot(leftTailRef, 0xff0000, 7, 8, [0.5, 0.6, -1.9], [0.5, -0.5, -3]);        // RL
    addSpot(rightTailRef, 0xff0000, 7, 8, [-0.55, 0.6, -1.9], [-0.5, -0.5, -3]);    // RR

    // Add blinkers
    addSpot(flBlinkerRef, 0xffa500, 12, 16, [0.7, 0.6, 1.9], [0.9, -0.6, 3]);       // FL
    addSpot(frBlinkerRef, 0xffa500, 12, 16, [-0.7, 0.6, 1.9], [-0.9, -0.6, 3]);     // FR

    addSpot(rlBlinkerRef, 0xffa500, 12, 16, [0.5, 0.6, -1.9], [0.9, -0.6, -3]);     // RL
    addSpot(rrBlinkerRef, 0xffa500, 12, 16, [-0.5, 0.6, -1.9], [-0.9, -0.6, -3]);   // RR

    return () => {
      const vehicleGroup = vehicleGroupRef.current;

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

        if (vehicleGroup) {
          vehicleGroup.remove(light);
          vehicleGroup.remove(light.target);
        } else {
          light.parent?.remove(light);
          light.target.parent?.remove(light.target);
        }

        lightRef.current = null;
      });
    };
  }, []);

  // Store the initial wheel rotations for later use
  const wheelRestRotations = useMemo(
    () => wheels.map((wheel) => wheel?.quaternion.clone() ?? null),
    [wheels]
  );

  // Backend wheel_speed is radians/second. Keep a continuous angle locally so
  // snapshot interpolation does not reset the visible wheel rotation.
  const wheelSpinAngles = useRef([0, 0, 0, 0]);
  const wheelBaseQuaternion = useRef(new Quaternion());
  const wheelSteerQuaternion = useRef(new Quaternion());
  const wheelSpinQuaternion = useRef(new Quaternion());
  const steeringAxis = useRef(new Vector3(0, 1, 0));
  const wheelAxle = useRef(new Vector3(1, 0, 0));

  useFrame((_, delta) => {
    // Selection previews use the transforms imported from the GLB. Do not let
    // a stale backend snapshot move the preview vehicle or its wheels.
    if (isVehiclePreview) return;

    const inputState = useInputStore.getState();
    const gameState = useGameStore.getState();
    const networkState = useNetworkStore.getState();

    const localPlayerId = networkState.playerId;
    const id = entityId ?? localPlayerId;
    if (!id) return;

    const isLocalPlayer = id === localPlayerId;

    const interp = getInterpolated(id);
    if (!interp) return;

    const input = inputState.input;
    const controls = inputState.controls;
    const camMode = gameState.camera;
    const isEditor = gameState.editor;

    const group = vehicleGroupRef.current;

    group.position.set(...interp.position);
    group.quaternion.set(...interp.rotation);

    // Temporary visual correction only.
    // group.position.set(0, 0, 0);

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

      const index = indexById[wheel.id];
      const wheelObject = wheels[index];
      const restRotation = wheelRestRotations[index];

      if (!wheelObject || !restRotation) return;

      wheelObject.position.set(...wheel.position);

      wheelSpinAngles.current[index] = MathUtils.euclideanModulo(
        wheelSpinAngles.current[index]
          + (wheel.wheel_speed ?? 0) * wheelDelta,
        Math.PI * 2
      );

      // Match DebugWheelVisualizer's steering sign and spin axis:
      // chassis rotation -> steering -> rolling spin -> GLB rest rotation.
      wheelBaseQuaternion.current.set(...wheel.rotation);
      wheelSteerQuaternion.current.setFromAxisAngle(
        steeringAxis.current,
        -(wheel.steer_angle ?? 0)
      );
      wheelSpinQuaternion.current.setFromAxisAngle(
        wheelAxle.current,
        wheelSpinAngles.current[index]
      );

      wheelObject.quaternion
        .copy(wheelBaseQuaternion.current)
        .multiply(wheelSteerQuaternion.current)
        .multiply(wheelSpinQuaternion.current)
        .multiply(restRotation);
    });


    const vehicleMask = isLocalPlayer
      ? input.vehicleMask
      : (interp as { vehicle_mask?: number }).vehicle_mask ?? 0;
    const headlights = hasFlag(vehicleMask, VehicleFlags.HEADLIGHTS);
    const hazards = hasFlag(vehicleMask, VehicleFlags.HAZARDS);
    const blinkerLeft = hasFlag(vehicleMask, VehicleFlags.BLINKER_LEFT) && !hazards;
    const blinkerRight = hasFlag(vehicleMask, VehicleFlags.BLINKER_RIGHT) && !hazards;

    // Animate headlights opening/closing based on input
    const openRotation = -Math.PI / 3;
    const closedRotation = 0;
    const targetRotation = headlights ? openRotation : closedRotation;

    headlightRotation.current = MathUtils.lerp(
      headlightRotation.current,
      targetRotation,
      5 * delta
    );

    if (headlightRef.current) {
      headlightRef.current.rotation.x = headlightRotation.current;
    }

    blinkTimer.current += delta;
    if (blinkTimer.current >= 0.5) {
      blinkTimer.current = 0;
      blinkState.current = !blinkState.current;
    }

    const blinkOn = blinkState.current;


    if (leftLightRef.current) leftLightRef.current.visible = headlights;
    if (rightLightRef.current) rightLightRef.current.visible = headlights;

    const braking = isLocalPlayer && controls.braking;
    if (leftTailRef.current) leftTailRef.current.visible = braking;
    if (rightTailRef.current) rightTailRef.current.visible = braking;

    if (flBlinkerRef.current) flBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn;
    if (frBlinkerRef.current) frBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn;
    if (rlBlinkerRef.current) rlBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn;
    if (rrBlinkerRef.current) rrBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn;

    if (isLocalPlayer && !isEditor && (camMode === "FIRST_PERSON" || camMode === "DEFAULT" || camMode === "BIRDS_EYE")) {
      const offset = new Vector3();

      if (camMode === "FIRST_PERSON") offset.set(0.29, 0.97, -0.01);
      if (camMode === "DEFAULT") offset.set(0, 1.75, 3.85);
      if (camMode === "BIRDS_EYE") offset.set(0, 7, 12);

      // offset.applyQuaternion(group.quaternion).add(group.position);
      // camera.position.lerp(offset, delta * 5);

      const target = group.position.clone();
      target.y += 1.2;
      camera.lookAt(target);
    }
  });

  return (
    <>
      <group ref={vehicleGroupRef}>
          <group
            position={[0, isVehiclePreview ? 0 : CHASSIS_VISUAL_OFFSET_Y, 0]}
          >
            {renderedGroups.BODY}
          </group>
        {isVehiclePreview &&
          wheels.map((wheel, i) =>
            wheel ? (
              <primitive key={`ae86-preview-wheel-${i}`} object={wheel} />
            ) : null
          )}
        {children}
      </group>
      {!isVehiclePreview &&
        wheels.map((wheel, i) =>
          wheel ? <primitive key={`ae86-wheel-${i}`} object={wheel} /> : null
        )}
    </>
  );
});

useGLTF.preload(MODEL_PATH);
export default Ae86;
