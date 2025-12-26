import * as THREE from "three";

type SlipRay = {
    origin: [number, number, number];
    direction: [number, number, number];
    magnitude: number;
    color: [number, number, number];
};

export function DebugSlipAngleVisualizer({
    slips,
    radius = 0.035,
}: {
    slips: SlipRay[];
    radius?: number;
}) {
    return (
        <>
            {slips.map((s, i) => {
                const dir = new THREE.Vector3(...s.direction).normalize();
                const height = Math.max(s.magnitude, 0.01);

                const pos = new THREE.Vector3(...s.origin)
                    .add(dir.clone().multiplyScalar(height * 0.5));

                // Rotate cylinder to face direction
                const quat = new THREE.Quaternion().setFromUnitVectors(
                    new THREE.Vector3(0, 1, 0),
                    dir
                );

                return (
                    <mesh
                        key={i}
                        position={pos}
                        quaternion={quat}
                        renderOrder={10}
                    >
                        <cylinderGeometry args={[radius, radius, height, 8]} />
                        <meshStandardMaterial
                            color={new THREE.Color(...s.color)}
                            emissive={new THREE.Color(...s.color)}
                            emissiveIntensity={0.7}
                            transparent
                            opacity={0.8}
                            depthTest={false}
                            depthWrite={false}
                        />
                    </mesh>
                );
            })}
        </>
    );
}
