export function CityGeometry() {
    return (
        <group>
            {/* Ground plane */}
            <mesh receiveShadow>
                <boxGeometry args={[200, 1, 200]} />
                <meshStandardMaterial color="gray" />
            </mesh>

            {/* Example building shapes */}
            <mesh position={[10, 5, -20]}>
                <boxGeometry args={[10, 10, 10]} />
                <meshStandardMaterial color="orange" wireframe />
            </mesh>

            <mesh position={[-15, 3, 5]}>
                <boxGeometry args={[6, 6, 6]} />
                <meshStandardMaterial color="yellow" wireframe />
            </mesh>
        </group>
    );
}
