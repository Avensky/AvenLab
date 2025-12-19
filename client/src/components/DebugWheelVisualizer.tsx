import { useMemo } from "react";
import * as THREE from "three";
import { Quaternion, Vector3 } from "three";

const X_AXIS = new Vector3(1, 0, 0);

function quatFromRightVector(right: [number, number, number]) {
    const v = new Vector3(...right).normalize();
    const q = new Quaternion();
    q.setFromUnitVectors(X_AXIS, v);
    return q;
}

/**
 * Returns a quaternion that rotates local +Y to match `dir`
 */
export function quatFromYAxis(dir: THREE.Vector3) {
    const yAxis = new THREE.Vector3(0, 1, 0);
    const target = dir.clone().normalize();

    const q = new THREE.Quaternion();
    q.setFromUnitVectors(yAxis, target);

    return q;
}

type DebugWheel = {
    center: [number, number, number];
    radius: number;
    grounded: boolean;
    compression: number;
    normal_force: number;
};

export function DebugWheelVisualizer({
    wheels,
    chassis_right
}: {
    wheels: DebugWheel[];
    chassis_right: [number, number, number];
}) {
    const materialGrounded = useMemo(
        () => new THREE.MeshStandardMaterial({ color: "lime" }),
        []
    );

    const materialAir = useMemo(
        () => new THREE.MeshStandardMaterial({ color: "red" }),
        []
    );

    const wheelQuat = quatFromRightVector(chassis_right);

    const right = new THREE.Vector3(...chassis_right);
    const quat = quatFromYAxis(right);

    return (
        <>
            {wheels.map((w, i) => {
                const mat = w.grounded ? materialGrounded : materialAir;

                return (
                    <mesh
                        key={i}
                        position={w.center as [number, number, number]}
                        quaternion={quat}
                        renderOrder={5}
                    >
                        <cylinderGeometry
                            args={[
                                w.radius,
                                w.radius,
                                w.radius * 0.6, // wheel width
                                20,
                            ]}
                        />
                        <meshStandardMaterial
                            color="blue"
                            metalness={0.3}
                            roughness={0.6}
                            wireframe
                            // transparent
                            // opacity={0.35}
                            depthWrite={false}
                        />
                    </mesh>
                );
            })}
        </>
    );
}
