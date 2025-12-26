import * as THREE from "three";
import { useMemo } from "react";

interface Spring {
    start: [number, number, number];
    end: [number, number, number];
    restEnd: [number, number, number];    // rest-length endpoint (ghost)
    ratio: number;
}

export function DebugSpringVisualizer({ springs, opacity1 = 0.9, opacity2 = 0.3 }: { springs: Spring[], opacity1?: number, opacity2?: number }) {

    return (
        <>
            {springs.map((s, i) => <group key={i}>
                <SpringHelix
                    start={s.start}
                    end={s.end}
                    restEnd={s.restEnd}
                    ratio={s.ratio}
                    opacity1={opacity1}
                    opacity2={opacity2}
                />
            </group>)}
        </>
    );
}

function springColor(r: number) {
    if (r < 0.05) return "#2b6cff"; // airborne
    if (r < 0.3) return "#2bff4a";
    if (r < 0.6) return "#ffd42b";
    if (r < 0.85) return "#ff8c2b";
    return "#ff2b2b"; // bottomed
}


function SpringHelix({
    start,
    end,
    restEnd,
    ratio,
    opacity1 = 1.0,
    opacity2 = 0.3,
}: {
    start: [number, number, number];
    end: [number, number, number];
    restEnd: [number, number, number];
    ratio: number;
    opacity1: number;
    opacity2: number;
}) {
    const { realGeom, ghostGeom, position, quaternion } = useMemo(() => {
        const a = new THREE.Vector3(...start);
        const c = new THREE.Vector3(...end);
        const b = new THREE.Vector3(...restEnd);

        const fullDir = new THREE.Vector3().subVectors(b, a);
        const totalLength = fullDir.length();
        if (totalLength < 1e-4) return {};

        const coils = 10;
        const radius = 0.05;
        const segments = 120;

        // 🔹 build full helix ONCE
        const points: THREE.Vector3[] = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = t * Math.PI * 2 * coils;
            points.push(
                new THREE.Vector3(
                    Math.cos(angle) * radius,
                    t * totalLength,
                    Math.sin(angle) * radius
                )
            );
        }

        const splitIndex = Math.floor(THREE.MathUtils.clamp(ratio, 0, 1) * segments);

        const realPoints = points.slice(0, splitIndex + 1);
        const ghostPoints = points.slice(splitIndex);
        const realRadius = THREE.MathUtils.lerp(0.01, 0.025, ratio);
        const ghostRadius = realRadius * 0.85;
        const realGeom =
            realPoints.length > 2
                ? new THREE.TubeGeometry(
                    new THREE.CatmullRomCurve3(realPoints),
                    realPoints.length * 2,
                    realRadius,
                    8,
                    false
                )
                : null;

        const ghostGeom =
            ghostPoints.length > 2
                ? new THREE.TubeGeometry(
                    new THREE.CatmullRomCurve3(ghostPoints),
                    ghostPoints.length * 2,
                    ghostRadius,
                    8,
                    false
                )
                : null;

        fullDir.normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            fullDir
        );

        return {
            realGeom,
            ghostGeom,
            position: a.clone().add(b).multiplyScalar(0.5),
            quaternion: quat,
        };
    }, [start, end, restEnd, ratio]);

    if (!realGeom && !ghostGeom) return null;

    return (
        <group position={position} quaternion={quaternion}>
            {realGeom && (
                <mesh renderOrder={2}>
                    <primitive object={realGeom} />
                    <meshStandardMaterial
                        color={springColor(ratio)}
                        emissive={springColor(ratio)}
                        emissiveIntensity={0.35}
                        depthTest={false}
                        depthWrite={false}
                        transparent
                        opacity={opacity1}
                    />
                </mesh>
            )}

            {ghostGeom && (
                <mesh renderOrder={1}>
                    <primitive object={ghostGeom} />
                    <meshStandardMaterial
                        color="#9ad7ff"
                        emissive="#9ad7ff"
                        emissiveIntensity={0.15}
                        transparent
                        opacity={opacity2}
                        depthTest={false}
                        depthWrite={false}
                    />
                </mesh>
            )}
        </group>
    );
}