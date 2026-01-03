// Tank.tsx
import React, { forwardRef, useImperativeHandle, useRef, useMemo, useEffect } from 'react';
import { Group, Vector3 } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useStore } from '../../store';
import { getTankParts } from '../../utils/getTankParts';
import { usePhysicsInterpolator } from '../../hooks/usePhysicsInterpolator'

interface TankProps extends React.PropsWithChildren {
    turretRotation?: number;
    cannonElevation?: number;
}

export default forwardRef(function TankModel(
    { children, turretRotation = 0, cannonElevation = 0 }: TankProps,
    ref: React.Ref<Group>
) {
    const { scene } = useGLTF('/models/cars/tank2.glb'); // NOTE: Use your real model path
    const group = useRef<Group>(null!);
    useImperativeHandle(ref, () => group.current);

    // Get references to the specific parts INSIDE the scene
    const turretRef = useRef<Group | null>(null);
    const cannonRef = useRef<Group | null>(null);
    const { turret, cannon } = getTankParts(scene);
    turretRef.current = turret;
    cannonRef.current = cannon;
    const { setSnapshot, getInterpolated } = usePhysicsInterpolator(100)

    // Find and store references once
    useMemo(() => {
        turretRef.current = scene.getObjectByName('Turret') as Group;
        cannonRef.current = scene.getObjectByName('Cannon') as Group;
    }, [scene]);

    const { camera } = useThree();
    const v = new Vector3();
    // Update transformations every frame ie. chassis
    useEffect(() => {
        const id = useStore.getState().player?.id
        const snapshot = useStore.getState()?.physicsData
        if (id && snapshot) {
            // console.log('[Prime] Initial snapshot', snapshot)
            setSnapshot(id, snapshot)
        }
    }, [useStore(s => s.physicsData)])
    useFrame((_, delta) => {
        const id = useStore.getState().player?.id
        if (!id) return
        const interp = getInterpolated(id)
        if (!interp) return

        // Update vehicle body
        group.current.position.set(interp.chassisBody.position.x, interp.chassisBody.position.y, interp.chassisBody.position.z)
        group.current.quaternion.set(interp.chassisBody.quaternion.x, interp.chassisBody.quaternion.y, interp.chassisBody.quaternion.z, interp.chassisBody.quaternion.w)

        // Apply tank parts rotation
        if (turretRef.current) {
            turretRef.current.rotation.y = turretRotation;
        }
        if (cannonRef.current) {
            cannonRef.current.rotation.x = cannonElevation;
        }

        // Camera logic
        const camMode = useStore.getState().camera;
        const editor = useStore.getState().booleans.editor;

        if (!editor) {
            if (camMode === 'FIRST_PERSON') { v.set(0.5, 2.5, 0.5); }
            else if (camMode === 'DEFAULT') { v.set(0, 2.5, 4.5); }
            else if (camMode === 'BIRDS_EYE') { v.set(0, 7, 12); }
            camera.position.lerp(v, delta);

            const target2 = new Vector3();
            group.current.getWorldPosition(target2);
            if (camMode === 'DEFAULT') {
                target2.y += 1.5;
                camera.lookAt(target2);
            }
        }
    });

    return (<>
        <primitive ref={group} object={scene}>
            {children}
        </primitive>
    </>
    );
});

useGLTF.preload('/models/cars/tank2.glb');
