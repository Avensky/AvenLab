import { useThree, useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useStore } from '../store';
import type { OrbitControls } from 'three-stdlib'

interface RotatingCameraProps {
    radius?: number
    height?: number
    speed?: number
    resumeDuration?: number
    orbitRef: React.RefObject<OrbitControls | null>

}
export function RotatingCamera({ radius = 5, height = 2, speed = 0.3, resumeDuration = 10, orbitRef }: RotatingCameraProps) {
    const { camera } = useThree();
    const screen = useStore((s) => s.screen);
    const camMode = useStore((s) => s.camera);
    const setRotatingCamera = useStore((s) => s.setRotatingCamera);
    // const angle = useStore((s) => s.rotatingCamera.angle);

    const [paused, setPaused] = useState(false);
    const pauseTimer = useRef<NodeJS.Timeout | null>(null);

    const isActive = screen === 'selection-screen' && camMode === 'GALLERY';

    useEffect(() => {
        const controls = orbitRef?.current;
        if (!controls) return;

        const handleUserInput = () => {
            if (!paused) {
                console.log('[RotatingCamera] Paused spin');
                setPaused(true);

                if (pauseTimer.current) clearTimeout(pauseTimer.current);

                pauseTimer.current = setTimeout(() => {
                    setPaused(false);
                    console.log('[RotatingCamera] Resume spin');
                }, resumeDuration * 1000);
            }
        };

        const dom = controls.domElement;
        if (!dom) return; // ✅ Guards undefined
        dom.addEventListener('pointerdown', handleUserInput);

        return () => {
            dom.removeEventListener('pointerdown', handleUserInput);
            if (pauseTimer.current) clearTimeout(pauseTimer.current);
        };
    }, [orbitRef, resumeDuration, screen, camMode]);

    useFrame(() => {
        if (paused || !isActive) return;

        const physicsData = useStore.getState().physicsData;
        const player = useStore.getState().player?.id;

        if (!player) return;

        const target = physicsData?.chassisBody?.position ?? new THREE.Vector3(0, 0, 0);
        if (!target) return;

        const currentAngle = useStore.getState().rotatingCamera.angle;
        const newAngle = currentAngle + speed * 0.01;
        setRotatingCamera({ angle: newAngle });

        const x = radius * Math.sin(newAngle);
        const z = radius * Math.cos(newAngle);
        const desiredPos = new THREE.Vector3(x, height, z);
        const lerpAlpha = Math.min(0.02, desiredPos.distanceTo(camera.position) * 0.05);
        camera.position.lerp(desiredPos, lerpAlpha);

        camera.lookAt(target.x, target.y, target.z);
    });

    return null;
}
