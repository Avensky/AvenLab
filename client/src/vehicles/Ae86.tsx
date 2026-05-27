import {forwardRef, useEffect, useImperativeHandle, useMemo, useRef,} from "react";
import type { PropsWithChildren } from "react";
import { Group, MathUtils, SpotLight, Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { clone } from "lodash-es";

import { useNetworkStore, useInputStore, useGameStore } from "../store";
import { usePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { hasFlag, VehicleFlags } from "../store/tools/inputMasks";


const MODEL_PATH = "/models/vehicles/ae86v2.glb";

export const Ae86 = forwardRef<Group, PropsWithChildren>(function Ae86(
  { children },
  ref: React.Ref<Group>
) {
    const { scene } = useGLTF(MODEL_PATH);
    const camera = useThree((state) => state.camera);


    const vehicleGroupRef = useRef<Group>(null!);
    const headlightRef = useRef<Group | null>(null);
    
    // Allow parent components to access the car group ref
    useImperativeHandle(ref, () => vehicleGroupRef.current, [])

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


    useEffect(() => {
      const parts = [
          "CarBody",
          "Interior",
          "SteeringWheel",
          "Headlights",
          "FL_Caliper",
          "FR_Caliper",
          "RL_Caliper",
          "RR_Caliper",
      ];
      
      for (const name of parts) {
        const original = scene.getObjectByName(name);
        if (!original) continue;

        const cloned = original.clone(true);

        if (name === "Headlights" && cloned instanceof Group) {
          headlightRef.current = cloned;
        }
        
        vehicleGroupRef.current.add(cloned);
      }
    
      const addSpot = (
          refObj: { current: SpotLight | null },
          color: number,
          intensity: number,
          distance: number,
          position: [number, number, number],
          target: [number, number, number]
      ) => {
          const light = new SpotLight(color, intensity, distance, Math.PI / 6, 0.2);
        light.position.set(...position);
        light.target.position.set(...target);
        light.visible = false;
        refObj.current = light;
        
        vehicleGroupRef.current.add(light);
        vehicleGroupRef.current.add(light.target);
      };

      addSpot(leftLightRef, 0xffffff, 5, 40, [-0.5, 0.7, -1.8], [-0.4, -0.6, -5]);
      addSpot(rightLightRef, 0xffffff, 5, 40, [0.55, 0.7, -1.8], [0.4, -0.6, -5]);

      addSpot(leftTailRef, 0xff0000, 3, 8, [-0.5, 0.6, 1.9], [-0.5, 0.5, 3]);
      addSpot(rightTailRef, 0xff0000, 3, 8, [0.57, 0.6, 1.8], [0.57, 0.5, 3]);

      addSpot(flBlinkerRef, 0xffa500, 12, 16, [-0.7, 0.6, -1.9], [-0.85, 0.6, -3]);
      addSpot(frBlinkerRef, 0xffa500, 12, 16, [0.7, 0.6, -1.9], [0.9, 0.6, -3]);
      addSpot(rlBlinkerRef, 0xffa500, 12, 16, [-0.5, 0.6, 1.9], [-0.9, 0.6, 3]);
      addSpot(rrBlinkerRef, 0xffa500, 12, 16, [0.5, 0.6, 1.9], [0.9, 0.6, 3]);
  }, [scene]);

  const wheels = useMemo(() => {
    return ["FL_Wheel", "FR_Wheel", "RL_Wheel", "RR_Wheel"].map((group) => {
      const original = scene.getObjectByName(group);
      return original ? clone(original) : null;
    });
  }, [scene]);

  // const wheels = useMemo(() => {
  //   return ["FL_Wheel", "FR_Wheel", "RL_Wheel", "RR_Wheel"].map((group) => {
  //       // Each group might contain multiple meshes, but we'll treat the group itself as a container
  //       const groupObj = new Group();
  //       Object.values(group).forEach((obj: Object3D) => { groupObj.add(obj);});
  //       return groupObj;
  //   });
  // }, [clonesByGroup]);


  useFrame((_, delta) => {
    const inputState = useInputStore.getState();
    const gameState = useGameStore.getState();
    const networkState = useNetworkStore.getState();
    const id = networkState.playerId;

    if (!id) return;

    const interp = getInterpolated(id);
    if (!interp) return;
    
    const input = inputState.input;
    const controls = inputState.controls;
    const camMode = gameState.camera;
    const isEditor = gameState.editor;
    
    const group = vehicleGroupRef.current;
    
    group.position.set(...interp.position);
    group.quaternion.set(...interp.rotation);

    const wheelMap = {
        fl: wheels[0],
        fr: wheels[1],
        rl: wheels[2],
        rr: wheels[3],
    } as const;

    interp.wheels?.forEach((wheel) => {
        const wheelObject = wheelMap[wheel.id];
        if (!wheelObject) return;

        wheelObject.position.set(...wheel.position);
        wheelObject.quaternion.set(...wheel.rotation);
    });

    const vehicleMask = input.vehicleMask;
    const headlights = hasFlag(vehicleMask, VehicleFlags.HEADLIGHTS);
    const hazards = hasFlag(vehicleMask, VehicleFlags.HAZARDS);
    const blinkerLeft = hasFlag(vehicleMask, VehicleFlags.BLINKER_LEFT) && !hazards;
    const blinkerRight = hasFlag(vehicleMask, VehicleFlags.BLINKER_RIGHT) && !hazards;
    const openRotation = 0;
    const closedRotation = -Math.PI / 3;
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

    if (leftTailRef.current) leftTailRef.current.visible = controls.braking;
    if (rightTailRef.current) rightTailRef.current.visible = controls.braking;

    if (flBlinkerRef.current) flBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn;
    if (frBlinkerRef.current) frBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn;
    if (rlBlinkerRef.current) rlBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn;
    if (rrBlinkerRef.current) rrBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn;

    if (!isEditor && (camMode === "FIRST_PERSON" || camMode === "DEFAULT" || camMode === "BIRDS_EYE")) {
      const offset = new Vector3();

      if (camMode === "FIRST_PERSON") offset.set(0.29, 0.97, -0.01);
      if (camMode === "DEFAULT") offset.set(0, 1.75, 3.85);
      if (camMode === "BIRDS_EYE") offset.set(0, 7, 12);

      offset.applyQuaternion(group.quaternion).add(group.position);
      camera.position.lerp(offset, delta * 5);

      const target = group.position.clone();
      target.y += 1.2;
      camera.lookAt(target);
    }
  });

  return (
    <>
      <group ref={vehicleGroupRef}>
        {children}
      
      </group>

      {wheels.map((wheel, i) =>
        wheel ? <primitive key={i} object={wheel} /> : null
      )}
    </>
  );
});

useGLTF.preload(MODEL_PATH);
export default Ae86;