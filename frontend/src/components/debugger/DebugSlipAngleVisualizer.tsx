import * as THREE from "three";

type SlipRay = {
    origin: [number, number, number];
    direction: [number, number, number];
    slip_angle: number;
    magnitude: number;
    color: [number, number, number];
};

export function DebugSlipAngleVisualizer({
    slips,
    radius = 0.035,
    vehiclePosition,
    vehicleQuaternion,

}: {
    slips: SlipRay[];
    radius?: number;
    vehiclePosition: [number, number, number];
    vehicleQuaternion: [number, number, number, number];
}) {


    const vehiclePos = new THREE.Vector3(...vehiclePosition);
    const vehicleQuat = new THREE.Quaternion(
        vehicleQuaternion[0],
        vehicleQuaternion[1],
        vehicleQuaternion[2],
        vehicleQuaternion[3]
    );
    const invQuat = vehicleQuat.clone().invert();

    return (
        <>
            {slips.map((s, i) => {
                // const dir = new THREE.Vector3(...s.direction).normalize();
                const dir = new THREE.Vector3(...s.direction).applyQuaternion(invQuat).normalize();

                // if you later send slip_angle (rad) instead of v_lat:
                const height = Math.max(s.magnitude, 0.01);
                // const height = THREE.MathUtils.clamp(
                //     Math.abs(s.slip_angle) * 0.6,
                //     0.02,
                //     0.6
                // );

                // const pos = new THREE.Vector3(...s.origin)
                //     .add(dir.clone().multiplyScalar(height * 0.5));

                const pos = new THREE.Vector3(...s.origin)
                    .sub(vehiclePos).applyQuaternion(invQuat)
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
