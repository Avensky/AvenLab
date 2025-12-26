import * as THREE from "three";
// import { useMemo } from "react";
import { Line } from "@react-three/drei";

type DebugRay = {
    origin: [number, number, number];
    direction: [number, number, number];
    length: number;
    hit?: [number, number, number];
    color: [number, number, number];
    ratio: number;
    airborne: boolean;
};

function springColor(r: number) {
    if (r < 0.05) return "#2b6cff"; // airborne / unloaded
    if (r < 0.3) return "#2bff4a";
    if (r < 0.6) return "#ffd42b";
    if (r < 0.85) return "#ff8c2b";
    return "#ff2b2b"; // bottomed
}

function rayColor(r: number, airborne: boolean) {
    if (airborne) return "#3a3a3a"; // dim gray
    return springColor(r);
}


export function DebugRayVisualizer({
    rays,
    thickness = 0.02,
    opacity = 1.0,
}: {
    rays: DebugRay[];
    thickness?: number;
    opacity?: number;
}) {

    return (
        <>
            {rays.map((ray, i) => {
                const origin = new THREE.Vector3(...ray.origin);
                const dir = new THREE.Vector3(...ray.direction);
                const end = origin.clone().add(dir.multiplyScalar(ray.length));

                const color = rayColor(ray.ratio, ray.airborne);
                const thick = thickness ?? 0.035; // 🌟 WORLD-UNIT THICKNESS

                return (
                    <group key={i}>
                        {/* 1️⃣ Full ray (reference / measurement) */}
                        <Line
                            points={[origin.toArray(), end.toArray()]}
                            color="#555"
                            lineWidth={0.01}
                            dashed
                            dashSize={0.05}
                            gapSize={0.04}
                            depthTest={false}
                            depthWrite={false}

                        />

                        {/* 2️⃣ Active segment (force / contact) */}
                        {ray.hit && (
                            <Line
                                points={[ray.origin, ray.hit]}
                                color={color}
                                lineWidth={thick}
                                depthTest={false}
                                depthWrite={false}
                            />
                        )}

                        {/* 3️⃣ Hit point marker */}
                        {ray.hit && (
                            <mesh position={ray.hit} renderOrder={10}>
                                <sphereGeometry args={[thick * 0.6, 12, 12]} />
                                <meshStandardMaterial
                                    color={color}
                                    emissive={color}
                                    emissiveIntensity={0.9}
                                    depthTest={false}
                                    depthWrite={false}
                                />
                            </mesh>
                        )}
                    </group>
                );
            })}
        </>
    );
}
