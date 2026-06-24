// Camaro.tsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { PropsWithChildren } from 'react';
import { useGLTF } from '@react-three/drei';
import { Group, MathUtils, Color, SpotLight, Vector3, Object3D } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { setupVehicleParts } from './tools/setupVehicleParts';
import { sharedGlassMaterial } from './tools/createGlassMaterialFactory';
import { useNetworkStore, useInputStore, useGameStore } from "../store";
import { usePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { hasFlag, VehicleFlags } from "../store/tools/inputMasks";

const MODEL_PATH = "/models/vehicles/camaro2017.glb";
export const Camaro = forwardRef<Group, PropsWithChildren>(function Camaro(
  { children },
  ref
) {  
    // Tint colors for first-person and exterior view  
    const tintFirstPerson = new Color(0xffffff);  // Clear
    const tintExterior = new Color(0x556677);     // Blue-gray tint (customize as needed)
    
    // Load the car model
    const { scene } = useGLTF(MODEL_PATH);

    // Access the camera for later use
    const camera = useThree((state) => state.camera)

    // Refs for car group 
    const vehicleGroupRef = useRef<Group>(null!)

    // Allow parent components to access the car group ref
    useImperativeHandle(ref, () => vehicleGroupRef.current, [])

    // Simulate hazard lights
    const blinkTimer = useRef(0)
    const blinkState = useRef(false)

    // Refs for individual lights   
    const leftLightRef = useRef<SpotLight | null>(null);
    const rightLightRef = useRef<SpotLight | null>(null);
    const leftTailRef = useRef<SpotLight | null>(null);
    const rightTailRef = useRef<SpotLight | null>(null);
    const flBlinkerRef = useRef<SpotLight | null>(null);
    const frBlinkerRef = useRef<SpotLight | null>(null);
    const rlBlinkerRef = useRef<SpotLight | null>(null);
    const rrBlinkerRef = useRef<SpotLight | null>(null);

    // Network and interpolation setup
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
                    name: 'BODY',
                    parts: [
                        'SUNROOF', 'SUNROOF_window', 'FRONT_windows',
                        'WINDSHIELD', 'REAR_WINDOW',
                        'RIGHT_QUARTER_WINDOW', 'LEFT_QUARTER_WINDOW',
                        'HEADLIGHT_LENS_LEFT', 'HEADLIGHT_LENS_RIGHT',
                        'TAILLIGHT_LENS_LEFT', 'TAILLIGHT_LENS_RIGHT',
                        'BODY', 'REARVIEW_MIRROR', 'GRILL', 'GRILL_2',
                        'CHASSIS', 'FRONT_BUMPER', 'FRONT_BUMPER_2',
                        'HEADLIGHTS', 'HEADLIGHTS_OFFSET', 'BODY_badges',
                        'BODY_DOOR_FRAMES', 'REAR_BRAKES_LEFT', 'REAR_BRAKES_RIGHT',
                        'REAR_CAB', 'REARBUMPER_badges', 'REARBUMPER',
                        'REARBUMPER_2', 'REARBUMPER_lights', 'REARBUMPER_LIP',
                        'FL_BRAKE_CALIPER', 'FR_BRAKE_CALIPER', 'RL_BRAKE_CALIPER',
                        'RR_BRAKE_CALIPER', 'INTERIOR', 'INTERIOR_2',
                        'SEATS', 'SEATS_2', 'SEATS_3', 'FRONT_CADDY',
                        'DASHBOARD', 'DASHBOARD_2', 'NEEDLE_RPM', 'NEEDLE_SPEED',
                        'MUFFLERS', 'EMPTY'
                    ],
                    transparent: [
                        'SUNROOF', 'SUNROOF_window', 'FRONT_windows', 'WINDSHIELD',
                        'RIGHT_QUARTER_WINDOW', 'LEFT_QUARTER_WINDOW',
                        // 'HEADLIGHT_LENS_LEFT', 'HEADLIGHT_LENS_RIGHT',
                        // 'TAILLIGHT_LENS_LEFT', 'TAILLIGHT_LENS_RIGHT',
                        'REAR_WINDOW',
                    ],
                    opacity: 0.4,
                },
                {
                    name: 'HOOD',
                    parts: [
                        'HOOD_VENT', 'HOOD', 'HOOD_2', 'HOOD_3'
                    ],
                },
                {
                    name: 'TRUNK',
                    parts: [
                        'TRUNK', 'TRUNK_WING', 'CENTER_BREAK_LIGHT',
                        'CHEVY_EMBLEM', 'REAR_BRAKES_BOOT'
                    ],

                },
                {
                    name: 'DOOR_LEFT',
                    parts: [
                        'DOOR_LEFT_LED', 'DOOR_LEFT', 'DOOR_LEFT_2',
                        'DOOR_LEFT_3', 'DOOR_LEFT_4', 'DOOR_LEFT_5',
                        'DOOR_LEFT_6', 'DOOR_LEFT_7', 'MIRROR_LEFT_GLASS',
                        'MIRROR_LEFT', 'MIRROR_LEFT_2', 'MIRROR_LEFT_3',
                        'LEFT_WINDOW',
                    ],
                    transparent: ['LEFT_WINDOW', 'MIRROR_LEFT_GLASS'],
                    opacity: 0.1,
                },
                {
                    name: 'DOOR_RIGHT',
                    parts: [
                        'DOOR_RIGHT_LED', 'DOOR_RIGHT', 'DOOR_RIGHT_2',
                        'DOOR_RIGHT_3', 'DOOR_RIGHT_4', 'DOOR_RIGHT_5',
                        'DOOR_RIGHT_6', 'DOOR_RIGHT_7', 'MIRROR_RIGHT',
                        'MIRROR_RIGHT_2', 'MIRROR_RIGHT_3', 'MIRROR_RIGHT_GLASS',
                        'RIGHT_WINDOWS',
                    ],
                    transparent: ['MIRROR_RIGHT_GLASS', 'RIGHT_WINDOWS'],
                    opacity: 0.1,
                },
                {
                    name: 'FL_WHEEL',
                    parts: ['FL_TIRE', 'FL_RIM', 'FL_ROTOR'],
                },
                {
                    name: 'FR_WHEEL',
                    parts: ['FR_TIRE', 'FR_RIM', 'FR_ROTOR'],
                },
                {
                    name: 'RL_WHEEL',
                    parts: ['RL_TIRE', 'RL_RIM', 'RL_ROTOR'],
                },
                {
                    name: 'RR_WHEEL',
                    parts: ['RR_TIRE', 'RR_RIM', 'RR_ROTOR'],
                },
                {
                    name: 'STEERING_WHEEL',
                    parts: [
                        'STEERING_WHEEL_CENTER', 'STEERING_WHEEL_SIDES',
                        'STEERING_WHEEL_INSIDE', 'STEERING_WHEEL_BOTTOM',],
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

        if (!isEditor && (camMode === 'FIRST_PERSON' || camMode === 'DEFAULT' || camMode === 'BIRDS_EYE')) {
            const offset = new Vector3();
            
            if (camMode === 'FIRST_PERSON') { offset.set(-0.25, .98, -.1); }
            if (camMode === 'DEFAULT') { offset.set(0, 2, 4); }
            if (camMode === 'BIRDS_EYE') { offset.set(0, 7, 12); }
            camera.position.lerp(offset, delta * 5);

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

    {/* <Dust /> */ }
    {/* <Skid /> */ }
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
});

useGLTF.preload(MODEL_PATH);
export default Camaro;
