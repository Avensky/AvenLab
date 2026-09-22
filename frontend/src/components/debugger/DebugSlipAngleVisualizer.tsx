import * as THREE from "three";

type SlipRay = {
    player_id?: string;
    origin: [number, number, number];
    direction: [number, number, number];
    slip_angle: number;
    magnitude: number;
    color: [number, number, number];
};

type DebugSlipAngleVisualizerProps = {
    slips: SlipRay[];
    radius?: number;

    // Kept temporarily for compatibility with older calls.
    // The values are intentionally not applied again.
    vehiclePosition?: [number, number, number];
    vehicleQuaternion?: [
        number,
        number,
        number,
        number,
    ];
};

export function DebugSlipAngleVisualizer({
    slips,
    radius = 0.035,
}: DebugSlipAngleVisualizerProps) {
    return (
        <>
            {slips.map((slip, index) => {
                const direction = new THREE.Vector3(
                    ...slip.direction
                ).normalize();

                const height = Math.max(
                    slip.magnitude,
                    0.01
                );

                const position = new THREE.Vector3(
                    ...slip.origin
                ).add(
                    direction
                        .clone()
                        .multiplyScalar(height * 0.5)
                );

                const quaternion =
                    new THREE.Quaternion().setFromUnitVectors(
                        new THREE.Vector3(0, 1, 0),
                        direction
                    );

                const color = new THREE.Color(
                    ...slip.color
                );

                return (
                    <mesh
                        key={`${
                            slip.player_id ?? "slip"
                        }-${index}`}
                        position={position}
                        quaternion={quaternion}
                        renderOrder={10}
                    >
                        <cylinderGeometry
                            args={[
                                radius,
                                radius,
                                height,
                                8,
                            ]}
                        />

                        <meshStandardMaterial
                            color={color}
                            emissive={color}
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