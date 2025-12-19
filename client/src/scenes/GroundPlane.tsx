// src/scenes/GroundPlane.tsx
import { Grid } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";
import { DoubleSide } from "three";

type GroundPlaneProps = ThreeElements["group"] & {
    size?: number;
    color?: string;
    showGrid?: boolean;
    opacity?: number;
};

export function GroundPlane({
    size = 1000,            // backend collider is 1000x1000 (500 half-extents)
    showGrid = true,
    opacity = 0.5,
    color = "#2a2a2a",
    ...props
}: GroundPlaneProps) {
    return (
        <group
            {...props}
            position={[0, 0, 0]}
        >
            {/* Reference plane at y=0 */}
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                receiveShadow
            >
                <planeGeometry args={[size, size, 1, 1]} />
                <meshStandardMaterial
                    transparent opacity={opacity}
                    side={DoubleSide}
                    color={color}
                    roughness={1}
                    metalness={0}
                />
            </mesh>

            {/* Optional grid overlay */}
            {showGrid && (
                <Grid
                    args={[size, size]}
                    position={[0, 0.001, 0]}   // tiny lift to prevent z-fighting
                    infiniteGrid={false}
                    cellSize={1}
                    sectionSize={10}
                    fadeDistance={0}
                />
            )}
        </group>
    );
}
