// Brz.tsx

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { PropsWithChildren } from 'react';
import { Group, Color, MathUtils, Quaternion, SpotLight, Vector3, Object3D } from 'three';
import { sharedGlassMaterial } from './tools/createGlassMaterialFactory';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';

import { useNetworkStore, useInputStore, useGameStore, useUIStore } from "../store";
import { usePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { hasFlag, VehicleFlags } from "../store/tools/inputMasks";

const MODEL_PATH = "/models/vehicles/brz.glb";

// The exported VEHICLE_ROOT is 0.50 m above the visible model floor. Keep this
// as a visual-only correction; backend wheel and chassis positions stay in
// authoritative world space.
const BRZ_VISUAL_OFFSET_Y = -0.57;

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
    names: readonly string[]
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

    // Preserve transforms contributed by any intermediate Blender parents.
    root.updateMatrixWorld(true);
    wheel.updateMatrixWorld(true);

    // Keep the complete imported orientation/scale, including VEHICLE_ROOT's
    // 180-degree Blender correction. Position is replaced by backend data.
    const importedWorldMatrix = wheel.matrixWorld.clone();
    wheel.removeFromParent();
    importedWorldMatrix.decompose(wheel.position, wheel.quaternion, wheel.scale);
    wheel.updateMatrix();

    return wheel;
}

type BrzProps = PropsWithChildren<{
    entityId?: string;
}>;

export const Brz = forwardRef<Group, BrzProps>(function Brz(
    { children, entityId },
    ref
) {
    // Tint colors for first-person and exterior views
    const tintFirstPerson = new Color(0xffffff);        // Clear tint for first-person view
    const tintExterior = new Color(0x556677);           // Blue-gray tint (customize as needed)

    const { scene } = useGLTF(MODEL_PATH);              // Load the car model
    const camera = useThree((state) => state.camera)    // Access the camera for later use
    const isVehiclePreview = useUIStore(
        (state) =>
            state.screen === "sandbox_setup" ||
            state.screen === "signal_recon_setup"
    );
    const vehicleGroupRef = useRef<Group>(null!);       // Refs for car group 
    const visualGroupRef = useRef<Group>(null!);

    // Allow parent components to access the car group ref
    useImperativeHandle(ref, () => vehicleGroupRef.current, [])

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

    // Network and interpolation setup
    const snapshot = useNetworkStore((s) => s.snapshot);
    const { setSnapshot, getInterpolated } = usePhysicsInterpolator(100);

    useEffect(() => {
        if (!snapshot) return;
        for (const entity of snapshot.entities) { setSnapshot(entity.id, entity); }
    }, [snapshot, setSnapshot]);


    const { vehicleVisualRoot, wheels } = useMemo(() => {
        // Clone the complete hierarchy instead of rebuilding a partial model
        // from a flat list of object names. This keeps every child beneath the
        // Blender VEHICLE_ROOT visible.
        const sourceRoot = scene.getObjectByName(BRZ_ROOT_NAME) ?? scene;
        const root = sourceRoot.clone(true);

        const extractedWheels = [
            extractWheel(root, BRZ_WHEEL_NAMES.fr),
            extractWheel(root, BRZ_WHEEL_NAMES.fl),
            extractWheel(root, BRZ_WHEEL_NAMES.rr),
            extractWheel(root, BRZ_WHEEL_NAMES.rl),
        ];

        return {
            vehicleVisualRoot: root,
            wheels: extractedWheels,
        };
    }, [scene]);

    useEffect(() => {
        const visualGroup = visualGroupRef.current;
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
            light.position.set(...position);
            light.target.position.set(...target);
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
    }, []);

    useEffect(() => {
        const missingWheelNames = (["FL", "FR", "RL", "RR"] as const)
            .filter((_, index) => !wheels[index]);

        if (missingWheelNames.length > 0) {
            console.warn(
                `[BRZ] Missing wheel roots: ${missingWheelNames.join(", ")}.`,
                "Expected one of:",
                BRZ_WHEEL_NAMES
            );
        }
    }, [wheels]);
    // Preserve every wheel's imported GLB orientation. Backend wheel_speed is
    // radians/second, so integrate it into a continuous visual rotation.
    const wheelRestRotations = useMemo(
        () => wheels.map((wheel) => wheel?.quaternion.clone() ?? null),
        [wheels]
    );
    const wheelSpinAngles = useRef([0, 0, 0, 0]);
    const wheelBaseQuaternion = useRef(new Quaternion());
    const wheelSteerQuaternion = useRef(new Quaternion());
    const wheelSpinQuaternion = useRef(new Quaternion());
    const steeringAxis = useRef(new Vector3(0, 1, 0));
    const wheelAxle = useRef(new Vector3(1, 0, 0));

    useFrame((_, delta) => {
        // Keep the selection model in its imported GLB pose. A previous game
        // may still have an interpolated snapshot for this player.
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
                wheelSpinAngles.current[index]
                    + (wheel.wheel_speed ?? 0) * wheelDelta,
                Math.PI * 2
            );

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

        if (isLocalPlayer && !isEditor && (camMode === "FIRST_PERSON" || camMode === "DEFAULT" || camMode === "BIRDS_EYE")) {
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

        if (isLocalPlayer) {
            const isFirstPerson = camMode === 'FIRST_PERSON';
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
        }
    })

    return (
        <>
            <group ref={vehicleGroupRef}>
                <group
                    ref={visualGroupRef}
                    position={[0, isVehiclePreview ? 0 : BRZ_VISUAL_OFFSET_Y, 0]}
                >
                    <primitive object={vehicleVisualRoot} />
                </group>
                {isVehiclePreview &&
                    wheels.map((wheel, i) => (
                        wheel ? (
                            <primitive key={`brz-preview-wheel-${i}`} object={wheel} />
                        ) : null
                    ))}
                {children}
            </group>
            {!isVehiclePreview &&
                wheels.map((wheel, i) => (
                    wheel ? <primitive key={`brz-wheel-${i}`} object={wheel} /> : null
                ))}
        </>
    );
})

useGLTF.preload(MODEL_PATH);
export default Brz;
