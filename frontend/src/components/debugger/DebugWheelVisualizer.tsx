// src/components/DebugWheelVisualizer.tsx

import { useRef } from "react";
import * as THREE from "three";
import { type DebugWheel } from "../../store";
import { useFrame } from "@react-three/fiber";


function wheelColor(wheel: DebugWheel) {
    if (!wheel.grounded) return "#ef4444";

    if (Math.abs(wheel.slip_ratio) > 0.15) {
        return "#d946ef"; // wheelspin or locked wheel
    }

    if (Math.abs(wheel.slip_angle) > 0.21) {
        return "#f97316"; // drifting: over about 12 degrees
    }

    if (Math.abs(wheel.slip_angle) > 0.10) {
        return "#facc15"; // tire scrub
    }

    return "#22c55e"; // grip
}

export function DebugWheelVisualizer({ wheels}: {wheels: DebugWheel[];}) {
    // const steerGroups = useRef<THREE.Group[]>([]);
    // const wheelMeshes = useRef<THREE.Mesh[]>([]);

    // const materialGround = useMemo(
    //     () => new THREE.MeshStandardMaterial({ color: "lime", wireframe: true }),
    //     []
    // );
    // const materialAir = useMemo(
    //     () => new THREE.MeshStandardMaterial({ color: "red", wireframe: true }),
    //     []
    // );

   const steerGroups = useRef<(THREE.Group | null)[]>([]);
    const spinGroups = useRef<(THREE.Group | null)[]>([]);
    const spinAngles = useRef<number[]>([]);

    useFrame((_, dt) => {
        wheels.forEach((wheel, index) => {
            const steerGroup = steerGroups.current[index];
            const spinGroup = spinGroups.current[index];

            if (steerGroup) {
                const targetSteer = wheel.steering
                    ? -wheel.steer_angle
                    : 0;

                steerGroup.rotation.y = THREE.MathUtils.damp(
                    steerGroup.rotation.y,
                    targetSteer,
                    12,
                    dt
                );
            }

            if (spinGroup) {
                spinAngles.current[index] =
                    (spinAngles.current[index] ?? 0) +
                    wheel.wheel_speed * dt;

                spinGroup.rotation.x = spinAngles.current[index];
            }
        });
    });


    return (
        <>
            {wheels.map((wheel, index) => {
                // const isFront = wheel.steering === true;
                return (
                    <group
                        key={index}
                        position={wheel.center}
                        quaternion={wheel.rotation}
                    >
                        <group
                            ref={(element) => {
                                steerGroups.current[index] = element;
                            }}
                        >
                            <group
                                ref={(element) => {
                                    spinGroups.current[index] = element;
                                }}
                            >
                                <mesh rotation={[0, 0, Math.PI / 2]}>
                                    <cylinderGeometry
                                        args={[
                                            wheel.radius,
                                            wheel.radius,
                                            wheel.radius * 0.6,
                                            20,
                                        ]}
                                    />
                                    <meshStandardMaterial
                                        color={wheelColor(wheel)}
                                        wireframe
                                    />
                                </mesh>
                            </group>
                        </group>
                    </group>
                );
            })}
        </>
    );
}
