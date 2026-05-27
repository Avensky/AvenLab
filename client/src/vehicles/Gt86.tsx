// Gt86.tsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { PropsWithChildren } from 'react';
import { useGLTF } from '@react-three/drei';
import { Group, Color, MathUtils, SpotLight, Vector3, Object3D } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { setupVehicleParts } from './tools/setupVehicleParts';
import { sharedGlassMaterial } from './tools/createGlassMaterialFactory';

import { useNetworkStore, useInputStore, useGameStore } from "../store";
import { usePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { hasFlag, VehicleFlags } from "../store/tools/inputMasks";

const MODEL_PATH = "/models/vehicles/gt86.glb";
export const Gt86 = forwardRef<Group, PropsWithChildren>(function Gt86(
  { children },
  ref
) {   
    const tintFirstPerson = new Color(0xffffff);  // Clear
    const tintExterior = new Color(0x556677);     // Blue-gray tint (customize as needed)
    
    const { scene } = useGLTF(MODEL_PATH);
    const camera = useThree((state) => state.camera)
    
    const vehicleGroupRef = useRef<Group>(null!)
    useImperativeHandle(ref, () => vehicleGroupRef.current, []);

    // Simulate hazard lights
    const blinkTimer = useRef(0)
    const blinkState = useRef(false)

    // Ref's are used for movements    
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

        for (const entity of snapshot.entities) {
        setSnapshot(entity.id, entity);
        }
    }, [snapshot, setSnapshot]);

    const { clonesByGroup, renderedGroups } = useMemo(() => {
        return setupVehicleParts({
            scene,
            groups: [
                {
                    name: 'BODY',
                    parts: [
                        'body',
                        'body0',
                        'body01',
                        'body02',
                        'body03',
                        'body04',
                        'body05',
                        'body06',
                        'chrome',
                        'chrome0',
                        'chrome1',
                        'chrome2',
                        'chrome02',
                        'chrome3',
                        'chrome4',
                        'chrome04',
                        'chrome5',
                        'chrome6',
                        'chrome7',
                        'chrome8',
                        'chrome09',
                        'chrome14',
                        // 'glass',
                        // 'glass0',
                        // 'glass2',
                        'gum',
                        // 'gum.000',
                        'gum000',
                        'gum0',
                        'gum1',
                        'gum01',
                        'gum2',
                        'gum02',
                        'gum3',
                        'gum03',
                        'gum4',
                        'gum04',
                        'gum05',
                        'gum6',
                        'gum06',
                        'gum7',
                        'gum8',
                        'gum09',
                        'gum11',
                        'int01',
                        'logo',
                        'Object01',
                        // 'Object01.000',
                        'Object01000',
                        'Object02',
                        'r_glass',
                        'r_glass01',
                        'red',
                        'red01',
                        'red02',
                        'silver',
                    ],
                    transparent: [
                        'glass',
                        'glass0',
                        'glass2'
                    ],
                    opacity: 0.4,
                },

                {
                    name: 'FL_WHEEL',
                    parts: ['gum397', 'silver0', 'silver01', 'silver02', 'gum07', 'gum08', 'chrome10'],
                },
                {
                    name: 'FR_WHEEL',
                    parts: ['gum400', 'silver05', 'silver03', 'silver04', 'gum398', 'gum399', 'chrome11'],
                },
                {
                    name: 'RL_WHEEL',
                    parts: ['gum404', 'silver08', 'silver06', 'silver07', 'gum402', 'gum403', 'chrome12'],
                },
                {
                    name: 'RR_WHEEL',
                    parts: ['gum408', 'silver10', 'silver11', 'silver09', 'gum409', 'gum407', 'chrome13'],
                },
                // {
                //     name: 'STEERING_WHEEL',
                //     parts: [
                //         'STEERING_WHEEL_CENTER', 'STEERING_WHEEL_SIDES',
                //         'STEERING_WHEEL_INSIDE', 'STEERING_WHEEL_BOTTOM',],
                // },
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
        light.target.updateMatrixWorld();
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
        addSpot(rrBlinkerRef, 0xffa500, 12, 18, [0.5, 0.6, 1.9], [0.9, 0.6, 3]);
    }, [scene]);

    const wheels = useMemo(() => {
        return [
        clonesByGroup["FL_WHEEL"],
        clonesByGroup["FR_WHEEL"],
        clonesByGroup["RL_WHEEL"],
        clonesByGroup["RR_WHEEL"],
        ].map((group) => {
        const groupObj = new Group();

        if (!group) return groupObj;

        Object.values(group).forEach((obj: Object3D) => {
            groupObj.add(obj);
        });

        return groupObj;
        });
    }, [clonesByGroup]);

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

        blinkTimer.current += delta;
        if (blinkTimer.current >= 0.5) {
        blinkTimer.current = 0;
        blinkState.current = !blinkState.current;
        }

        const vehicleMask = input.vehicleMask;

        const headlights = hasFlag(vehicleMask, VehicleFlags.HEADLIGHTS);
        const hazards = hasFlag(vehicleMask, VehicleFlags.HAZARDS);
        const blinkerLeft =
        hasFlag(vehicleMask, VehicleFlags.BLINKER_LEFT) && !hazards;
        const blinkerRight =
        hasFlag(vehicleMask, VehicleFlags.BLINKER_RIGHT) && !hazards;

        const blinkOn = blinkState.current;

        if (leftLightRef.current) leftLightRef.current.visible = headlights;
        if (rightLightRef.current) rightLightRef.current.visible = headlights;

        if (leftTailRef.current) leftTailRef.current.visible = controls.braking;
        if (rightTailRef.current) rightTailRef.current.visible = controls.braking;

        if (flBlinkerRef.current) {
        flBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn;
        }

        if (frBlinkerRef.current) {
        frBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn;
        }

        if (rlBlinkerRef.current) {
        rlBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn;
        }

        if (rrBlinkerRef.current) {
        rrBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn;
        }

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

        if (
        !isEditor &&
        (camMode === "FIRST_PERSON" ||
            camMode === "DEFAULT" ||
            camMode === "BIRDS_EYE")
        ) {
        const offset = new Vector3();

        if (camMode === "FIRST_PERSON") offset.set(-0.25, 0.98, -0.1);
        if (camMode === "DEFAULT") offset.set(0, 2, 4);
        if (camMode === "BIRDS_EYE") offset.set(0, 7, 12);

        offset.applyQuaternion(group.quaternion).add(group.position);
        camera.position.lerp(offset, delta * 5);

        const target = group.position.clone();
        target.y += 1.2;
        camera.lookAt(target);
        }

        const isFirstPerson = camMode === "FIRST_PERSON";
        const targetOpacity = isFirstPerson ? 0.1 : 0.4;
        const targetIOR = isFirstPerson ? 1.0 : 6.5;
        const targetColor = isFirstPerson ? tintFirstPerson : tintExterior;
        const transitionSpeed = 3.0;
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

        sharedGlassMaterial.color.lerp(targetColor, t);
        sharedGlassMaterial.needsUpdate = true;
    });
    
    return (
        <>
            <group ref={vehicleGroupRef} >
                {Object.values(renderedGroups)}
                {children}
            </group>
            {
                wheels.map((wheel, i) => (
                    <primitive key={`wheel-${i}`} object={wheel} />
                ))
            }
        </>
    )
});

useGLTF.preload(MODEL_PATH);
export default Gt86;