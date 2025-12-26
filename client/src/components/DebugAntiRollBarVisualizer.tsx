// DebugAntiRollBarVisualizer.tsx
import * as THREE from "three";

type ArbRay = {
    origin: [number, number, number];
    direction: [number, number, number];
    length: number;
    color: [number, number, number];
};

export function DebugAntiRollBarVisualizer({
    links,
    radius = 0.05,
}: {
    links: ArbRay[];
    radius?: number;
}) {
    return (
        <>
            {links.map((r, i) => {
                const dir = new THREE.Vector3(...r.direction).normalize();
                const len = Math.max(r.length, 0.01);

                // Anchor at origin + half-length in direction
                const pos = new THREE.Vector3(...r.origin)
                    .add(dir.clone().multiplyScalar(len * 0.5));

                // Align cylinder to direction
                const quat = new THREE.Quaternion().setFromUnitVectors(
                    new THREE.Vector3(0, 1, 0),
                    dir
                );

                return (
                    <mesh key={i} position={pos} quaternion={quat} renderOrder={15}>
                        <cylinderGeometry args={[radius, radius, len, 8]} />
                        <meshStandardMaterial
                            color={new THREE.Color(...r.color)}
                            emissive={new THREE.Color(...r.color)}
                            emissiveIntensity={0.8}
                            transparent
                            opacity={0.85}
                            depthTest={false}
                            depthWrite={false}
                        />
                    </mesh>
                );
            })}
        </>
    );
}
