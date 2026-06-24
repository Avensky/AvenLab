import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three-stdlib";
import { useGameStore, useNetworkStore } from "../store";

interface RotatingCameraProps {
    radius?: number;
    height?: number;
    speed?: number;
    resumeDuration?: number;
    orbitRef: React.RefObject<OrbitControls | null>;
}

const fallbackTarget = new THREE.Vector3(0, 0, 0);

export function RotatingCamera({
    radius = 5,
    height = 2,
    speed = 0.3,
    resumeDuration = 10,
    orbitRef,
}: RotatingCameraProps) {
    const { camera } = useThree();

    const screen = useGameStore((s) => s.screen);
    const camMode = useGameStore((s) => s.camera);
    const setRotatingCamera = useGameStore((s) => s.setRotatingCamera);

    const [paused, setPaused] = useState(false);
    const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isActive = screen === "selection-screen" && camMode === "GALLERY";

    useEffect(() => {
        const controls = orbitRef.current;
        if (!controls?.domElement) return;

        const handleUserInput = () => {
            if (paused) return;

            setPaused(true);

            if (pauseTimer.current) {
                clearTimeout(pauseTimer.current);
            }

            pauseTimer.current = setTimeout(() => {
                setPaused(false);
            }, resumeDuration * 1000);
        };

        const dom = controls.domElement;
        dom.addEventListener("pointerdown", handleUserInput);

        return () => {
            dom.removeEventListener("pointerdown", handleUserInput);

            if (pauseTimer.current) {
                clearTimeout(pauseTimer.current);
                pauseTimer.current = null;
            }
        };
    }, [orbitRef, paused, resumeDuration]);

    useFrame(() => {
        if (paused || !isActive) return;

        const me = useNetworkStore.getState().getMe();

        const target = me
            ? new THREE.Vector3(me.position[0], me.position[1], me.position[2])
            : fallbackTarget;

        const currentAngle = useGameStore.getState().rotatingCamera;
        const newAngle = currentAngle + speed * 0.01;
        setRotatingCamera(newAngle);

        const x = radius * Math.sin(newAngle);
        const z = radius * Math.cos(newAngle);

        const desiredPos = new THREE.Vector3(
            target.x + x,
            target.y + height,
            target.z + z,
        );

        const lerpAlpha = Math.min(
            0.02,
            desiredPos.distanceTo(camera.position) * 0.05,
        );

        camera.position.lerp(desiredPos, lerpAlpha);
        camera.lookAt(target);
    });

    return null;
}