// Tank.tsx
import React, { forwardRef, useImperativeHandle, useRef, useEffect, type PropsWithChildren } from 'react';
import { Group, Vector3 } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { getTankParts } from './tools/getTankParts';
import { useNetworkStore, useGameStore } from "../store";
import { usePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
interface TankProps extends React.PropsWithChildren {
    turretRotation?: number;
    cannonElevation?: number;
}

const MODEL_PATH = "/models/vehicles/tank2.glb";
export const Tank = forwardRef<Group, PropsWithChildren>(function TankModel(
    { children, turretRotation = 0, cannonElevation = 0 }: TankProps,
    ref: React.Ref<Group>
) {
    // Load the car model
    const { scene } = useGLTF(MODEL_PATH);

    // Access the camera for later use
    const camera = useThree((state) => state.camera)

    // Refs for car group 
    const vehicleGroupRef = useRef<Group>(null!);

    // Allow parent components to access the car group ref
    useImperativeHandle(ref, () => vehicleGroupRef.current, [])

    // Get references to the specific parts INSIDE the scene
    const turretRef = useRef<Group | null>(null);
    const cannonRef = useRef<Group | null>(null);

    useEffect(() => {
        const { turret, cannon } = getTankParts(scene);

        turretRef.current = turret ?? (scene.getObjectByName("Turret") as Group | null);
        cannonRef.current = cannon ?? (scene.getObjectByName("Cannon") as Group | null);
    }, [scene]);

    // Network and interpolation setup
    const snapshot = useNetworkStore((s) => s.snapshot);
    const { setSnapshot, getInterpolated } = usePhysicsInterpolator(100);

    useEffect(() => {
        if (!snapshot) return;
        for (const entity of snapshot.entities) { setSnapshot(entity.id, entity); }
    }, [snapshot, setSnapshot]);


    useFrame((_, delta) => {
        // get state on frame
        const gameState = useGameStore.getState();
        const networkState = useNetworkStore.getState();
        const id = networkState.playerId;

        if (!id) return;

        const interp = getInterpolated(id);
        if (!interp) return;

        const camMode = gameState.camera;
        const isEditor = gameState.editor;

        const group = vehicleGroupRef.current;


        // Update vehicle body
        group.position.set(...interp.position);
        group.quaternion.set(...interp.rotation);

        // Apply tank parts rotation
        if (turretRef.current) {
            turretRef.current.rotation.y = turretRotation;
        }
        if (cannonRef.current) {
            cannonRef.current.rotation.x = cannonElevation;
        }

        if (!isEditor) {
            const offset = new Vector3();
            if (camMode === 'FIRST_PERSON') { offset.set(0.5, 2.5, 0.5); }
            if (camMode === 'DEFAULT') { offset.set(0, 2.5, 4.5); }
            if (camMode === 'BIRDS_EYE') { offset.set(0, 7, 12); }
            camera.position.lerp(offset, delta);

            offset.applyQuaternion(group.quaternion).add(group.position);
            camera.position.lerp(offset, delta * 5);

            const target = group.position.clone();
            target.y += 1.5;
            camera.lookAt(target);
        }
    });

    return (<>
        <primitive ref={vehicleGroupRef} object={scene}>
            {children}
        </primitive>
    </>
    );
});

useGLTF.preload('/models/vehicles/tank2.glb');
export default Tank;