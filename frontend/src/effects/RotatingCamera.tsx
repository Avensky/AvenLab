import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three-stdlib";
import { useGameStore, useNetworkStore, useUIStore } from "../store";

interface RotatingCameraProps {
    radius?: number;
    height?: number;
    speed?: number;
    resumeDuration?: number;
    orbitRef: React.RefObject<OrbitControls | null>;
}


export function RotatingCamera({
    radius = 5,
    height = 2,
    speed = 0.3,
    resumeDuration = 10,
    orbitRef,
}: RotatingCameraProps) {
    const { camera } = useThree();

    const screen = useUIStore((s) => s.screen);
    const camMode = useGameStore((s) => s.camera);
    const angle = useRef(useGameStore.getState().rotatingCamera);
    const target = useRef(new THREE.Vector3());
    const desiredPos = useRef(new THREE.Vector3());
    // Preserve the angle for the next gallery session without waking global
    // camera/editor subscribers for each frame of the orbit.
    useEffect(() => () => {
        const game = useGameStore.getState();
        if (game.rotatingCamera !== angle.current) game.setRotatingCamera(angle.current);
    }, []);

    const [paused, setPaused] = useState(false);
    const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isActive =
        camMode === "GALLERY" &&
        (screen === "sandbox_setup" || screen === "signal_recon_setup");

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

        if (me) target.current.fromArray(me.position);
        else target.current.set(0, 0, 0);
        angle.current += speed * 0.01;
        desiredPos.current.set(
            target.current.x + radius * Math.sin(angle.current),
            target.current.y + height,
            target.current.z + radius * Math.cos(angle.current),
        );

        const lerpAlpha = Math.min(
            0.02,
            desiredPos.current.distanceTo(camera.position) * 0.05,
        );

        camera.position.lerp(desiredPos.current, lerpAlpha);
        camera.lookAt(target.current);
    });

    return null;
}