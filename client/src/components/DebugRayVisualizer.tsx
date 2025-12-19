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


export function DebugRayVisualizer({ rays }: { rays: DebugRay[] }) {

    return (
        <>
            {rays.map((ray, i) => {
                const origin = new THREE.Vector3(...ray.origin);
                const dir = new THREE.Vector3(...ray.direction);
                const end = origin.clone().add(dir.multiplyScalar(ray.length));
                const color = rayColor(ray.ratio, ray.airborne);

                return (
                    <group key={i}>
                        {/* 1️⃣ Full ray (measurement / reference) */}
                        <Line
                            points={[origin.toArray(), end.toArray()]}
                            color="#666"
                            lineWidth={1}
                            dashed
                        />

                        {/* 2️⃣ Active segment (origin → hit) */}
                        {ray.hit && (
                            <Line
                                points={[ray.origin, ray.hit]}
                                color={color}
                                lineWidth={2}
                            />
                        )}

                        {/* 3️⃣ Hit point marker */}
                        {ray.hit && (
                            <mesh position={ray.hit} renderOrder={10}>
                                <sphereGeometry args={[0.045, 10, 10]} />
                                <meshStandardMaterial
                                    color={color}
                                    emissive={color}
                                    emissiveIntensity={0.35}
                                />
                            </mesh>
                        )}
                    </group>
                );
            })}
        </>
    );
}
