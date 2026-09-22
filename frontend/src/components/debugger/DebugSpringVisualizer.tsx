import * as THREE from "three";
import { useMemo } from "react";

export type DebugSpring = {
    /** World-space attachment point on the chassis. */
    start: [number, number, number];
    /** World-space center of the wheel. */
    end: [number, number, number];
    /** Retained for compatibility with existing VehicleScene data. */
    restEnd?: [number, number, number];
    ratio: number;
};

type DebugSpringVisualizerProps = {
    springs: DebugSpring[];
    opacity1?: number;
    // Retained so existing call sites do not need to change immediately.
    opacity2?: number;
    // Endpoints are already world-space. These props remain optional for
    // compatibility, but are deliberately not used for another transform.
    vehiclePosition?: [number, number, number];
    vehicleQuaternion?: [number, number, number, number];
};

export function DebugSpringVisualizer({
    springs,
    opacity1 = 0.9,
}: DebugSpringVisualizerProps) {
    return (
        <>
            {springs.map((spring, index) => (
                <SpringHelix
                    key={index}
                    start={spring.start}
                    end={spring.end}
                    ratio={spring.ratio}
                    opacity={opacity1}
                />
            ))}
        </>
    );
}

function springColor(ratio: number) {
    if (ratio < 0.05) return "#2b6cff";
    if (ratio < 0.3) return "#2bff4a";
    if (ratio < 0.6) return "#ffd42b";
    if (ratio < 0.85) return "#ff8c2b";
    return "#ff2b2b";
}

function SpringHelix({
    start,
    end,
    ratio,
    opacity,
}: {
    start: [number, number, number];
    end: [number, number, number];
    ratio: number;
    opacity: number;
}) {
    const { geometry, position, quaternion } = useMemo(() => {
        const chassisAnchor = new THREE.Vector3(...start);
        const wheelCenter = new THREE.Vector3(...end);
        const direction = wheelCenter.clone().sub(chassisAnchor);
        const length = direction.length();

        if (length < 1e-4) {
            return {
                geometry: null,
                position: chassisAnchor,
                quaternion: new THREE.Quaternion(),
            };
        }

        const coils = 8;
        const coilRadius = 0.035;
        const tubeRadius = THREE.MathUtils.lerp(
            0.01,
            0.018,
            THREE.MathUtils.clamp(ratio, 0, 1)
        );
        const segments = 64;
        const points: THREE.Vector3[] = [];

        for (let index = 0; index <= segments; index += 1) {
            const t = index / segments;

            // Straight leads make the endpoints exact: chassis anchor and
            // wheel center, rather than the side of the first/last coil.
            if (index === 0) {
                points.push(new THREE.Vector3(0, 0, 0));
                continue;
            }
            if (index === segments) {
                points.push(new THREE.Vector3(0, length, 0));
                continue;
            }

            const angle = t * Math.PI * 2 * coils;
            points.push(
                new THREE.Vector3(
                    Math.cos(angle) * coilRadius,
                    t * length,
                    Math.sin(angle) * coilRadius
                )
            );
        }

        direction.normalize();

        return {
            geometry: new THREE.TubeGeometry(
                new THREE.CatmullRomCurve3(points),
                segments,
                tubeRadius,
                6,
                false
            ),
            // Render directly in world space so the spring follows the car.
            position: chassisAnchor,
            quaternion: new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                direction
            ),
        };
    }, [start, end, ratio]);

    if (!geometry) return null;

    const color = springColor(ratio);

    return (
        <mesh
            geometry={geometry}
            position={position}
            quaternion={quaternion}
            renderOrder={2}
        >
            <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.35}
                depthTest={false}
                depthWrite={false}
                transparent
                opacity={opacity}
            />
        </mesh>
    );
}
