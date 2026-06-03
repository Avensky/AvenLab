import {forwardRef, useEffect, useImperativeHandle, useMemo, useRef,} from "react";
import type { PropsWithChildren } from "react";
import { Group, MathUtils, Object3D, SpotLight, Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { clone } from "lodash-es";

import { useNetworkStore, useInputStore, useGameStore } from "../store";
import { usePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { hasFlag, VehicleFlags } from "../store/tools/inputMasks";


const MODEL_PATH = "/models/vehicles/ae86.glb";
const BODY_NAMES = ["vehicle_body_joined", "CarBody", "BODY"];
const HEADLIGHT_NAMES = ["Headlights", "Headlights001", "headlights"];
const WHEEL_NAMES = {
  fl: ["FL_Wheel", "FL_Wheel001", "Wheel_FL", "wheel_fl"],
  fr: ["FR_Wheel", "FR_Wheel001", "Wheel_FR", "wheel_fr"],
  rl: ["RL_Wheel", "RL_Wheel001", "Wheel_RL", "wheel_rl"],
  rr: ["RR_Wheel", "RR_Wheel001", "Wheel_RR", "wheel_rr"],
} as const;

function findFirst(scene: Object3D, names: readonly string[]) {
  for (const name of names) {
    const found = scene.getObjectByName(name);
    if (found) return found;
  }
  return null;
}

export const Ae86 = forwardRef<Group, PropsWithChildren>(function Ae86(
  { children },
  ref: React.Ref<Group>
) {
    const { scene } = useGLTF(MODEL_PATH);
    const camera = useThree((state) => state.camera);


    const vehicleGroupRef = useRef<Group>(null!);
    const visualRootRef = useRef<Group>(null!);
    const headlightRef = useRef<Object3D | null>(null);
    
    // Allow parent components to access the car group ref
    useImperativeHandle(ref, () => vehicleGroupRef.current, [])

    const headlightRotation = useRef(0);

    // Simulate hazard lights
    const blinkTimer = useRef(0);
    const blinkState = useRef(false);

    // Refs for individual lights
    const leftLightRef  = useRef<SpotLight | null>(null);
    const rightLightRef = useRef<SpotLight | null>(null);
    const leftTailRef   = useRef<SpotLight | null>(null);
    const rightTailRef  = useRef<SpotLight | null>(null);
    const flBlinkerRef  = useRef<SpotLight | null>(null);
    const frBlinkerRef  = useRef<SpotLight | null>(null);
    const rlBlinkerRef  = useRef<SpotLight | null>(null);
    const rrBlinkerRef  = useRef<SpotLight | null>(null);

    const snapshot = useNetworkStore((s) => s.snapshot);
    const { setSnapshot, getInterpolated } = usePhysicsInterpolator(100);

    useEffect(() => {
      if (!snapshot) return;
      for (const entity of snapshot.entities) { setSnapshot(entity.id, entity); }
    }, [snapshot, setSnapshot]);


    const bodyObject = useMemo(() => {
      const body = findFirst(scene, BODY_NAMES);
      return body ? clone(body) : clone(scene);
    }, [scene]);

    const wheels = useMemo(() => {
      return [
        findFirst(scene, WHEEL_NAMES.fl),
        findFirst(scene, WHEEL_NAMES.fr),
        findFirst(scene, WHEEL_NAMES.rl),
        findFirst(scene, WHEEL_NAMES.rr),
      ].map((obj) => (obj ? clone(obj) : null));
    }, [scene]);

    useEffect(() => {
      const headlight = findFirst(bodyObject, HEADLIGHT_NAMES);
      if (headlight) {headlightRef.current = headlight;}
    
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
        
        visualRootRef.current.add(light);
        visualRootRef.current.add(light.target);
      };

      addSpot(leftLightRef, 0xffffff, 5, 40, [-0.5, 0.7, -1.8], [-0.4, -0.6, -5]);
      addSpot(rightLightRef, 0xffffff, 5, 40, [0.55, 0.7, -1.8], [0.4, -0.6, -5]);

      addSpot(leftTailRef, 0xff0000, 3, 8, [-0.5, 0.6, 1.9], [-0.5, 0.5, 3]);
      addSpot(rightTailRef, 0xff0000, 3, 8, [0.57, 0.6, 1.8], [0.57, 0.5, 3]);

      addSpot(flBlinkerRef, 0xffa500, 12, 16, [-0.7, 0.6, -1.9], [-0.85, 0.6, -3]);
      addSpot(frBlinkerRef, 0xffa500, 12, 16, [0.7, 0.6, -1.9], [0.9, 0.6, -3]);
      addSpot(rlBlinkerRef, 0xffa500, 12, 16, [-0.5, 0.6, 1.9], [-0.9, 0.6, 3]);
      addSpot(rrBlinkerRef, 0xffa500, 12, 16, [0.5, 0.6, 1.9], [0.9, 0.6, 3]);
  }, [bodyObject]);

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
    
    // Temporary visual correction only.
    // group.position.set(0, 0, 0);

    if (interp.wheels) {
      const wheelMap = {
        fl: wheels[0],
        fr: wheels[1],
        rl: wheels[2],
        rr: wheels[3],
      } as const;

      interp.wheels.forEach((wheel) => {
        const wheelObject = wheelMap[wheel.id];
        if (!wheelObject) return;

        wheelObject.position.set(...wheel.position);
        wheelObject.quaternion.set(...wheel.rotation);
      });

      //  const me = useNetworkStore.getState().getMe();

      // console.log("raw position", me?.position);
      // console.log("interp position", interp.position);
      // console.log("wheel positions", interp.wheels?.map(w => [w.id, w.position]));
    }

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

      // offset.applyQuaternion(group.quaternion).add(group.position);
      // camera.position.lerp(offset, delta * 5);

      // const target = group.position.clone();
      // target.y += 1.2;
      // camera.lookAt(target);
    }
  });


  useEffect(() => {
    scene.traverse((obj) => {
      console.log("[ae86 glb]", obj.name, obj.type);
    });
  }, [scene]);
  

 

  return (
    <>
      <group ref={vehicleGroupRef}>
        <group ref={visualRootRef}>
          <primitive object={bodyObject} />
          {children}
        </group>
      </group>
      {wheels.map((wheel, i) =>
        wheel ? <primitive key={`ae86-wheel-${i}`} object={wheel} /> : null
      )}
    </>
  );
});

useGLTF.preload(MODEL_PATH);
export default Ae86;