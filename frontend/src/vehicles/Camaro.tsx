// Camaro.tsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { PropsWithChildren } from 'react';
import { useGLTF } from '@react-three/drei';
import { Group, MathUtils, Mesh, SpotLight, Vector3 } from 'three';
import type { Material, Object3D } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { setupVehicleParts } from './tools/setupVehicleParts';
import { useNetworkStore, useInputStore, useGameStore, useUIStore } from "../store";
import { usePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { hasFlag, VehicleFlags } from "../store/tools/inputMasks";

const MODEL_PATH = "/models/vehicles/camaro.glb";

// Move only the rendered chassis. Backend wheel centers remain in world space.
const DEFAULT_VISUAL_Y_OFFSET = -0.55;
const GLASS_OPACITY = 0.60;

const GLASS_PARTS = new Set([
    'SUNROOF_window',
    'FRONT_windows',
    'WINDSHIELD',
    'REAR_WINDOW',
    'RIGHT_QUARTER_WINDOW',
    'LEFT_QUARTER_WINDOW',
    'LEFT_WINDOW',
    'RIGHT_WINDOWS',
]);

const DYNAMIC_WHEEL_GROUPS = new Set([
    'FL_WHEEL',
    'FR_WHEEL',
    'RL_WHEEL',
    'RR_WHEEL',
]);

type CamaroProps = PropsWithChildren<{
    entityId?: string;
    visualYOffset?: number;
}>;

type WheelVisualRig = {
    carrier: Group;
    steer: Group;
    spin: Group;
};

function cloneVehicleMaterial(material: Material, isGlass: boolean) {
    const clone = material.clone();
    clone.transparent = isGlass;
    clone.opacity = isGlass ? GLASS_OPACITY : 1;
    clone.depthWrite = !isGlass;
    clone.needsUpdate = true;
    return clone;
}

function configureObjectMaterials(root: Object3D, isGlass: boolean) {
    root.traverse((object) => {
        if (!(object instanceof Mesh)) return;

        object.material = Array.isArray(object.material)
            ? object.material.map((material) =>
                cloneVehicleMaterial(material, isGlass)
            )
            : cloneVehicleMaterial(object.material, isGlass);
    });
}

export const Camaro = forwardRef<Group, CamaroProps>(function Camaro(
    {
        children,
        entityId,
        visualYOffset = DEFAULT_VISUAL_Y_OFFSET,
    },
    ref
) {
    // Load the car model
    const { scene } = useGLTF(MODEL_PATH);

    // Access the camera for later use
    const camera = useThree((state) => state.camera)

    // Refs for car group 
    const vehicleGroupRef = useRef<Group>(null!)
    const vehicleVisualGroupRef = useRef<Group>(null!)

    const isVehiclePreview = useUIStore(
        (state) =>
            state.screen === "sandbox_setup" ||
            state.screen === "signal_recon_setup"
    );

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
        const setup = setupVehicleParts({
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
                        'INTERIOR', 'INTERIOR_2',
                        'SEATS', 'SEATS_2', 'SEATS_3', 'FRONT_CADDY',
                        'DASHBOARD', 'DASHBOARD_2', 'NEEDLE_RPM', 'NEEDLE_SPEED',
                        'MUFFLERS', 'EMPTY'
                    ],
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
        });

        // Clone materials per part so windows can remain transparent without
        // making the body transparent or mutating another Camaro instance.
        Object.values(setup.clonesByGroup).forEach((group) => {
            Object.entries(group as Record<string, Object3D>).forEach(
                ([partName, object]) => {
                    configureObjectMaterials(
                        object,
                        GLASS_PARTS.has(partName)
                    );
                }
            );
        });

        return setup;

    }, [scene])

    useEffect(() => {
        const visualGroup = vehicleVisualGroupRef.current;
        if (!visualGroup) return;

        const addSpot = (
            refObj: { current: SpotLight | null },
            color: number,
            intensity: number,
            distance: number,
            position: [number, number, number],
            target: [number, number, number]
        ) => {
            const light = new SpotLight(color, intensity, distance, Math.PI / 6, 0.2);
            // Match the model's 180-degree rotation around the vertical Y axis.
            // Rotate both the mounting position and beam target: (x, y, z) -> (-x, y, -z).
            light.position.set(-position[0], position[1], -position[2]);
            light.target.position.set(-target[0], target[1], -target[2]);
            light.visible = false;
            refObj.current = light;

            visualGroup.add(light);
            visualGroup.add(light.target);
        };

        addSpot(leftLightRef, 0xffffff, 5, 40, [-0.5, 0.7, -1.8], [-0.4, -0.6, -5]);
        addSpot(rightLightRef, 0xffffff, 5, 40, [0.55, 0.7, -1.8], [0.4, -0.6, -5]);

        addSpot(leftTailRef, 0xff0000, 3, 8, [-0.5, 0.6, 1.9], [-0.5, 0.5, 3]);
        addSpot(rightTailRef, 0xff0000, 3, 8, [0.57, 0.6, 1.8], [0.57, 0.5, 3]);

        addSpot(flBlinkerRef, 0xffa500, 12, 16, [-0.7, 0.6, -1.9], [-0.85, 0.6, -3]);
        addSpot(frBlinkerRef, 0xffa500, 12, 16, [0.7, 0.6, -1.9], [0.9, 0.6, -3]);
        addSpot(rlBlinkerRef, 0xffa500, 12, 16, [-0.5, 0.6, 1.9], [-0.9, 0.6, 3]);
        addSpot(rrBlinkerRef, 0xffa500, 12, 16, [0.5, 0.6, 1.9], [0.9, 0.6, 3]);

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

    }, [])


    const wheelRigs = useMemo<WheelVisualRig[]>(() => {
        return [
            clonesByGroup['FL_WHEEL'],
            clonesByGroup['FR_WHEEL'],
            clonesByGroup['RL_WHEEL'],
            clonesByGroup['RR_WHEEL'],
        ].map((parts, index) => {
            const carrier = new Group();
            const steer = new Group();
            const spin = new Group();

            carrier.add(steer);
            steer.add(spin);

            Object.values(parts).forEach((object: Object3D) => {
                spin.add(object);
            });

            // Calipers have different origins from tires in this GLB.
            // Preserve their authored relationship using full matrices, and
            // map it into the existing (already working) tire clone frame.
            const prefix = ['FL', 'FR', 'RL', 'RR'][index];
            const sourceTire = scene.getObjectByName(`${prefix}_TIRE`);
            const sourceCaliper = scene.getObjectByName(`${prefix}_BRAKE_CALIPER`);
            const clonedTire = parts[`${prefix}_TIRE`] as Object3D | undefined;

            if (sourceTire && sourceCaliper && clonedTire) {
                sourceTire.updateWorldMatrix(true, false);
                sourceCaliper.updateWorldMatrix(true, false);
                clonedTire.updateMatrix();

                const caliper = sourceCaliper.clone(true);
                const caliperInWheel = clonedTire.matrix.clone()
                    .multiply(sourceTire.matrixWorld.clone().invert())
                    .multiply(sourceCaliper.matrixWorld);

                caliper.matrix.copy(caliperInWheel);
                caliper.matrix.decompose(
                    caliper.position, caliper.quaternion, caliper.scale
                );
                caliper.matrixAutoUpdate = false;
                configureObjectMaterials(caliper, false);
                steer.add(caliper);
            } else {
                console.warn(`[Camaro] Missing tire/caliper for ${prefix}`);
            }

            return { carrier, steer, spin };
        });
    }, [clonesByGroup, scene]);

    // Rolling and steering must use separate pivots or one transform will
    // overwrite the other.
    const wheelSpinAngles = useRef([0, 0, 0, 0]);

    useFrame((_, delta) => {
        // Selection previews keep the transforms imported from Blender.
        if (isVehiclePreview) return;

        // get state on frame
        const inputState = useInputStore.getState();
        const gameState = useGameStore.getState();
        const networkState = useNetworkStore.getState();
        const localPlayerId = networkState.playerId;
        const id = entityId ?? localPlayerId;

        if (!id) return;

        const isLocalPlayer = id === localPlayerId;

        const interp = getInterpolated(id);
        if (!interp) return;

        // Wheel transforms are interpolated, but some interpolator versions
        // omit scalar wheel fields. Read those fields from the newest raw
        // snapshot so steering cannot silently fall back to zero.
        const rawEntity = networkState.snapshot?.entities.find(
            (entity) => entity.id === id
        );
        const rawWheelsById = new Map(
            (rawEntity?.wheels ?? []).map((wheel) => [
                wheel.id.toLowerCase(),
                wheel,
            ])
        );
        const animatedWheels =
            interp.wheels && interp.wheels.length > 0
                ? interp.wheels
                : rawEntity?.wheels ?? [];

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
        const vehicleMask = isLocalPlayer
            ? input.vehicleMask
            : (interp as { vehicle_mask?: number }).vehicle_mask ?? 0;

        const headlights = hasFlag(vehicleMask, VehicleFlags.HEADLIGHTS);
        const hazards = hasFlag(vehicleMask, VehicleFlags.HAZARDS);
        const blinkerLeft = hasFlag(vehicleMask, VehicleFlags.BLINKER_LEFT) && !hazards;
        const blinkerRight = hasFlag(vehicleMask, VehicleFlags.BLINKER_RIGHT) && !hazards;

        const blinkOn = blinkState.current;

        // Lights visibility
        if (leftLightRef.current) leftLightRef.current.visible = headlights;
        if (rightLightRef.current) rightLightRef.current.visible = headlights;
        const braking = isLocalPlayer && controls.braking;
        if (leftTailRef.current) leftTailRef.current.visible = braking;
        if (rightTailRef.current) rightTailRef.current.visible = braking;

        if (flBlinkerRef.current) flBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn
        if (frBlinkerRef.current) frBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn
        if (rlBlinkerRef.current) rlBlinkerRef.current.visible = (hazards || blinkerLeft) && blinkOn
        if (rrBlinkerRef.current) rrBlinkerRef.current.visible = (hazards || blinkerRight) && blinkOn

        // Update vehicle body
        group.position.set(...interp.position);
        group.quaternion.set(...interp.rotation);

        const indexById = {
            fr: 0,
            fl: 1,
            rr: 2,
            rl: 3,
        } as const;

        // Avoid a large spin jump after a slow frame or returning to the tab.
        const wheelDelta = Math.min(delta, 0.05);

        animatedWheels.forEach((wheel) => {
            const wheelId = wheel.id.toLowerCase() as keyof typeof indexById;
            const index = indexById[wheelId];
            if (index === undefined) return;

            const rig = wheelRigs[index];
            if (!rig) return;

            const rawWheel = rawWheelsById.get(wheelId);
            const steerAngle =
                wheelId === 'fl' || wheelId === 'fr'
                    ? rawWheel?.steer_angle ?? wheel.steer_angle ?? 0
                    : 0;
            const wheelSpeed =
                rawWheel?.wheel_speed ?? wheel.wheel_speed ?? 0;

            rig.carrier.position.set(...wheel.position);
            rig.carrier.quaternion.set(...wheel.rotation);

            rig.steer.rotation.y = MathUtils.damp(
                rig.steer.rotation.y,
                -steerAngle,
                12,
                wheelDelta
            );

            wheelSpinAngles.current[index] = MathUtils.euclideanModulo(
                wheelSpinAngles.current[index]
                    + wheelSpeed * wheelDelta,
                Math.PI * 2
            );
            rig.spin.rotation.x = wheelSpinAngles.current[index];
        });

        if (isLocalPlayer && !isEditor && (camMode === 'FIRST_PERSON' || camMode === 'DEFAULT' || camMode === 'BIRDS_EYE')) {
            const offset = new Vector3();

            if (camMode === 'FIRST_PERSON') { offset.set(-0.25, .98 + visualYOffset, -.1); }
            if (camMode === 'DEFAULT') { offset.set(0, 2 + visualYOffset, 4); }
            if (camMode === 'BIRDS_EYE') { offset.set(0, 7 + visualYOffset, 12); }
            offset.applyQuaternion(group.quaternion).add(group.position);
            camera.position.lerp(offset, delta * 5);

            const target = group.position.clone();
            target.y += 1.2 + visualYOffset;
            camera.lookAt(target);
        }

    })

    {/* <Dust /> */ }
    {/* <Skid /> */ }
    return (
        <>
            <group ref={vehicleGroupRef}>
                <group
                    ref={vehicleVisualGroupRef}
                    position={[0, isVehiclePreview ? 0 : visualYOffset, 0]}
                >
                    {Object.entries(renderedGroups)
                        .filter(([groupName]) =>
                            !DYNAMIC_WHEEL_GROUPS.has(groupName)
                        )
                        .map(([, renderedGroup]) => renderedGroup)}
                </group>

                {isVehiclePreview && wheelRigs.map((rig, index) => (
                    <primitive
                        key={`camaro-preview-wheel-${index}`}
                        object={rig.carrier}
                    />
                ))}

                {children}
            </group>

            {!isVehiclePreview && wheelRigs.map((rig, index) => (
                <primitive
                    key={`camaro-wheel-${index}`}
                    object={rig.carrier}
                />
            ))}
        </>
    );
});

useGLTF.preload(MODEL_PATH);
export default Camaro;
