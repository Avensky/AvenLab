// src/components/DebugWheelVisualizer.tsx

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useSnapshotStore, type DebugWheel } from "../store/store";
import { useFrame } from "@react-three/fiber";

export function DebugWheelVisualizer({
    wheels,
    vehiclePosition,
    vehicleQuaternion,
}: {
    wheels: DebugWheel[];
    vehiclePosition: [number, number, number];
    vehicleQuaternion: [number, number, number, number];
}) {


    const steerGroups = useRef<THREE.Group[]>([]);
    const wheelMeshes = useRef<THREE.Mesh[]>([]);

    const materialGround = useMemo(
        () => new THREE.MeshStandardMaterial({ color: "lime", wireframe: true }),
        []
    );
    const materialAir = useMemo(
        () => new THREE.MeshStandardMaterial({ color: "red", wireframe: true }),
        []
    );

    const vehiclePos = new THREE.Vector3(...vehiclePosition);
    const vehicleQuat = new THREE.Quaternion(
        vehicleQuaternion[0],
        vehicleQuaternion[1],
        vehicleQuaternion[2],
        vehicleQuaternion[3]
    );
    const invVehicleQuat = vehicleQuat.clone().invert();


    useFrame((_, dt) => {
        const input = useSnapshotStore.getState().input;

        const MAX_STEER = Math.PI / 6;
        const steerAngle = -(input?.steer ?? 0) * MAX_STEER;

        const throttle = input?.throttle ?? 0;
        const brake = input?.brake ?? 0;
        // const handbrake = input?.handbrake ?? 0; // add later if not yet present

        steerGroups.current.forEach((g) => {
            if (!g) return;
            g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, steerAngle, 0.25);
        });

        wheelMeshes.current.forEach((m, i) => {
            if (!m) return;

            const wheel = wheels[i];
            const isRear = wheel.drive === true;

            // --- DRIVETRAIN (RWD) ---
            if (isRear && throttle !== 0) {
                m.rotation.x += throttle * dt * 12;
            }

            // --- SERVICE BRAKE (ALL WHEELS) ---
            if (brake > 0) {
                m.rotation.x *= THREE.MathUtils.lerp(1, 0.85, brake);
            }

            // --- HANDBRAKE (REAR ONLY, HARD LOCK) ---
            // if (handbrake > 0 && isRear) {
            //     m.rotation.x *= 0.2;
            // }
        });
    });


    return (
        <>
            {wheels.map((w, i) => {
                // const axis = new THREE.AxesHelper(0.5);
                // wheel.add(axis);
                // const mat = w.grounded ? materialGround : materialAir;

                // const role: "front" | "rear" = i < 2 ? "front" : "rear";
                const isFront = w.steering === true;

                const world = new THREE.Vector3(...w.center);
                const local = world.sub(vehiclePos).applyQuaternion(invVehicleQuat);
                return (
                    <group
                        key={i}
                        position={local.toArray() as [number, number, number]}
                        ref={(el) => {
                            if (isFront) steerGroups.current[i] = el!;
                        }}
                    >
                        <mesh
                            ref={(el) => (wheelMeshes.current[i] = el!)}
                            material={w.grounded ? materialGround : materialAir}
                            rotation={[0, 0, Math.PI / 2]}
                        >
                            <cylinderGeometry
                                args={[w.radius, w.radius, w.radius * 0.6, 20]}
                            />
                            <axesHelper args={[w.radius * 1.5]} />
                        </mesh>
                    </group>
                );
            })}
        </>
    );
}
