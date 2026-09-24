
export function PhysicsFloor() {
    
    const x = 260;
    const z = 440;
    return (
        <group name="physics-floor-reference">
            {/* Top surface is exactly Y = 0 */}
            <mesh position={[0, -0.1, 0]}>
                <boxGeometry args={[x, 0.2, z]} />

                <meshBasicMaterial
                    color="#00ffff"
                    transparent
                    opacity={0.18}
                    depthWrite={false}
                />
            </mesh>

            {/* <gridHelper
                args={[x, z, "#ffff00", "#334155"]}
                position={[0, 0.002, 0]}
            /> */}

            <axesHelper args={[2]} position={[0, 0.01, 0]} />
        </group>
    );
}