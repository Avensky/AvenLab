// Brz.tsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { PropsWithChildren } from 'react';
import { Group, Color, MathUtils, SpotLight, Vector3, Object3D } from 'three';
import { setupVehicleParts } from './tools/setupVehicleParts';
import { sharedGlassMaterial } from './tools/createGlassMaterialFactory';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';

import { useNetworkStore, useInputStore, useGameStore } from "../store";
import { usePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { hasFlag, VehicleFlags } from "../store/tools/inputMasks";

const MODEL_PATH = "/models/vehicles/brz.glb";

export const Brz = forwardRef<Group, PropsWithChildren>(function Brz(
  { children },
  ref
) {
    // Tint colors for first-person and exterior views
    const tintFirstPerson = new Color(0xffffff);  // Clear
    const tintExterior = new Color(0x556677);     // Blue-gray tint (customize as needed)
    
    // Load the car model
    const { scene } = useGLTF(MODEL_PATH);
    
    // Access the camera for later use
    const camera = useThree((state) => state.camera)
    
    // Refs for car group 
    const vehicleGroupRef   = useRef<Group>(null!);

    // Allow parent components to access the car group ref
    useImperativeHandle(ref, () => vehicleGroupRef.current, [])
    
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

    // Network and interpolation setup
    const snapshot = useNetworkStore((s) => s.snapshot);
    const { setSnapshot, getInterpolated } = usePhysicsInterpolator(100);

    useEffect(() => {
      if (!snapshot) return;
      for (const entity of snapshot.entities) { setSnapshot(entity.id, entity);}
    }, [snapshot, setSnapshot]);


    const { clonesByGroup, renderedGroups } = useMemo(() => {
        return setupVehicleParts({
            scene,
            groups: [
                {
                    name: 'BODY',
                    parts: [
                        'BODY_01',
                        'BODY_02',
                        'BODY_03',
                        'BODY_CHASSIS',
                        'BODY_FIN',

                        'BUMPER_FRONT',
                        'BUMPER_REAR',
                        'BUMPER_REAR_BOTTOM',

                        'CRASHBAR_FRONT',
                        'CRASHBAR_REAR',

                        'DOOR_STICKERS',

                        'ENGINE',
                        'ENGINE_01',
                        'ENGINE_02',
                        'ENGINE_03',
                        'ENGINE_04',
                        'ENGINE_05',
                        'ENGINE_INTERCOOLER',

                        'FENDER_FRONT_LEFT',
                        'FENDER_FRONT_RIGHT',

                        'FENDER_REAR_LEFT',
                        'FENDER_REAR_RIGHT',

                        'HEADLIGHT_LEFT',
                        'HEADLIGHT_RIGHT',

                        'INTERIOR',
                        'INTERIOR_FRAME',

                        'MUFFLER',
                        'MUFFLER_LEFT_01',
                        'MUFFLER_LEFT_02',
                        'MUFFLER_LEFT_03',
                        'MUFFLER_LEFT_04',
                        'MUFFLER_RIGHT_01',
                        'MUFFLER_RIGHT_02',
                        'MUFFLER_RIGHT_03',
                        'MUFFLER_RIGHT_04',

                        'SIDESKIRT_LEFT',
                        'SIDESKIRT_RIGHT',

                        'TAILLIGHT_LEFT',
                        'TAILLIGHT_RIGHT',

                        'TRANSMISSION_SYSTEM',

                        'REAR_WINDSHIELD_FRAME',
                        'REAR_WINDSHIELD',
                        'REAR_WINDSHIELD_TINT',

                        'WINDOW_REAR_LEFT_FRAME',
                        'WINDOW_REAR_RIGHT_FRAME',
                        'WINDOWS_FRAME',

                        'WINDSHIELD_FRAME',
                        'WINDSHIELD',
                        'WINDSHIELD_TINT',

                        'WINDSHIELD_WIPERS',
                        'WINDSHIELD_WIPERS_01',


                        'HEADLIGHT_LEFT',
                        'HEADLIGHT_RIGHT',

                        'TAILLIGHT_LEFT',
                        'TAILLIGHT_RIGHT',

                        'HEADLIGHT_LEFT_LENS_COVER',
                        'HEADLIGHT_RIGHT_LENS_COVER',

                        'TAILLIGHT_LEFT_LENS_COVER',
                        'TAILLIGHT_RIGHT_LENS_COVER',

                    ],
                    transparent: [
                        'REAR_WINDSHIELD',
                        'REAR_WINDSHIELD_TINT',

                        'WINDSHIELD',
                        'WINDSHIELD_TINT',

                        'HEADLIGHT_LEFT_LENS_COVER',
                        'HEADLIGHT_RIGHT_LENS_COVER',

                        'TAILLIGHT_LEFT_LENS_COVER',
                        'TAILLIGHT_RIGHT_LENS_COVER',
                    ],
                    opacity: .9,
                },
                {
                    name: 'HOOD',
                    parts: [
                        'HOOD',
                        'HOOD_ARM',
                        'HOOD_FRAME',
                        'HOOD_LATCH',
                        'HOOD_LATCH_LOCK',
                        'HOOD_VENT',
                        'HOOD_VENT_FRAME',
                    ],
                },
                {
                    name: 'TRUNK',
                    parts: [
                        'TRUNK',
                        'TRUNK_01',
                        'TRUNK_02',
                        'TRUNK_03',
                        'TRUNK_04',
                        'TRUNK_05',
                        'TRUNK_06',
                        'TRUNK_ARMS',
                        'TRUNK_LISENCE_PLATE',
                        'TRUNK_SPOILER',
                    ],

                },
                {
                    name: 'DOOR_LEFT',
                    parts: [
                        'DOOR_LEFT',

                        'WINDOW_REAR_LEFT',
                        'WINDOW_REAR_LEFT_TINT',
                        'WINDOW_LEFT',
                        'WINDOW_LEFT_TINT',
                        'WINDOW_FRONT_LEFT',
                        'WINDOW_FRONT_LEFT_TINT',
                    ],
                    transparent: [
                        'WINDOW_REAR_LEFT',
                        'WINDOW_REAR_LEFT_TINT',
                        'WINDOW_LEFT',
                        'WINDOW_LEFT_TINT',
                        'WINDOW_FRONT_LEFT',
                        'WINDOW_FRONT_LEFT_TINT',
                    ],
                    opacity: 0.9,
                },
                {
                    name: 'DOOR_RIGHT',
                    parts: [
                        'DOOR_RIGHT',
                        'WINDOW_REAR_RIGHT',
                        'WINDOW_REAR_RIGHT_TINT',
                        'WINDOW_RIGHT',
                        'WINDOW_RIGHT_TINT',
                        'WINDOW_FRONT_RIGHT',
                        'WINDOW_FRONT_RIGHT_TINT',
                    ],
                    transparent: [
                        'WINDOW_REAR_RIGHT',
                        'WINDOW_REAR_RIGHT_TINT',
                        'WINDOW_RIGHT',
                        'WINDOW_RIGHT_TINT',
                        'WINDOW_FRONT_RIGHT',
                        'WINDOW_FRONT_RIGHT_TINT',
                    ],
                    opacity: 0.9,
                },
                {
                    name: 'FL_WHEEL',
                    parts: ['WHEEL_FL'],
                },
                {
                    name: 'FR_WHEEL',
                    parts: ['WHEEL_FR'],
                },
                {
                    name: 'RL_WHEEL',
                    parts: ['WHEEL_RL'],
                },
                {
                    name: 'RR_WHEEL',
                    parts: ['WHEEL_RR'],
                },
                {
                    name: 'STEERING_WHEEL',
                    parts: [
                        'STEERING_WHEEL',],
                },
            ],
            // camMode,
        })

    }, [scene])

    useEffect(() => {
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
      
    }, [scene])


    const wheels = useMemo(() => {
        return [clonesByGroup['FL_WHEEL'], clonesByGroup['FR_WHEEL'], clonesByGroup['RL_WHEEL'], clonesByGroup['RR_WHEEL']].map((group) => {
            // Each group might contain multiple meshes, but we'll treat the group itself as a container
            const groupObj = new Group();
            Object.values(group).forEach((obj: Object3D) => {
                groupObj.add(obj);
            });
            return groupObj;
        });
    }, [clonesByGroup]);

    useFrame((_, delta) => {
        // get state on frame
        const inputState = useInputStore.getState();
        const gameState = useGameStore.getState();
        const networkState = useNetworkStore.getState();
        const id = networkState.playerId;

        if (!id) return;

        const interp = getInterpolated(id);
        if (!interp) return;

        const controls = inputState.controls;
        const input = inputState.input;
        const camMode = gameState.camera;
        const isEditor = gameState.editor;

        const group = vehicleGroupRef.current;

        // Update blink state every 0.5s
        blinkTimer.current += delta
        if (blinkTimer.current >= 0.5) {
            blinkTimer.current = 0
            blinkState.current = !blinkState.current
        }

        // Determine which lights should be on based on input state
        const vehicleMask = input.vehicleMask;
        
        const headlights = hasFlag(vehicleMask, VehicleFlags.HEADLIGHTS);
        const hazards = hasFlag(vehicleMask, VehicleFlags.HAZARDS);
        const blinkerLeft = hasFlag(vehicleMask, VehicleFlags.BLINKER_LEFT) && !hazards;
        const blinkerRight = hasFlag(vehicleMask, VehicleFlags.BLINKER_RIGHT) && !hazards;
        
        const blinkOn = blinkState.current;
        
        // Lights visibility
        if (leftLightRef.current) leftLightRef.current.visible = headlights;
        if (rightLightRef.current) rightLightRef.current.visible = headlights;
        if (leftTailRef.current) leftTailRef.current.visible = controls.braking;
        if (rightTailRef.current) rightTailRef.current.visible = controls.braking;

        if (flBlinkerRef.current) flBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn
        if (frBlinkerRef.current) frBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn
        if (rlBlinkerRef.current) rlBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn
        if (rrBlinkerRef.current) rrBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn

        // Update vehicle body
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

        if (!isEditor && (camMode === "FIRST_PERSON" || camMode === "DEFAULT" || camMode === "BIRDS_EYE")) {
            const offset = new Vector3();

            if (camMode === "FIRST_PERSON") offset.set(-0.28, 1.01, -.1);
            if (camMode === "DEFAULT") offset.set(0, 2, 4);
            if (camMode === "BIRDS_EYE") offset.set(0, 7, 12);

            offset.applyQuaternion(group.quaternion).add(group.position);
            camera.position.lerp(offset, delta * 5);

            const target = group.position.clone();
            target.y += 1.2;
            camera.lookAt(target);
        }

        const isFirstPerson = camMode === 'FIRST_PERSON';
        const targetOpacity = isFirstPerson ? 0.1 : 0.4;
        const targetIOR = isFirstPerson ? 1.0 : 6.5;
        const targetColor = isFirstPerson ? tintFirstPerson : tintExterior;
        const transitionSpeed = 3.0; // seconds it takes to reach 90% of the transition
        const t = delta / transitionSpeed;

        sharedGlassMaterial.opacity = MathUtils.lerp(
            sharedGlassMaterial.opacity,
            targetOpacity,
            t
        );

        sharedGlassMaterial.ior = MathUtils.lerp(
            sharedGlassMaterial.ior,
            targetIOR,
            t
        );
        sharedGlassMaterial.color.lerp(targetColor, t); // 👈 tint fade
        sharedGlassMaterial.needsUpdate = true;
    })

    return (
        <>
            <group ref={vehicleGroupRef}>
                {Object.values(renderedGroups)}
                {children}
            </group>
            {wheels.map((wheel, i) => (
                wheel ? <primitive key={i} object={wheel} /> : null
            ))}
        </>
    );
})

useGLTF.preload(MODEL_PATH);
export default Brz;
