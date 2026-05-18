// src/components/GeomeryVisualizer.tsx

import type { DebugChassis } from "../store";


export function GeometryVisualizer({
    chassis,
    color,
    opacity,
}: {
    chassis?: DebugChassis;
    mode: string;
    color: string;
    opacity: number;
}) {

    if (!chassis) return null;

    const [hx, hy, hz] = chassis.half_extents;
        return (
            <mesh scale={[hx * 2, hy * 2, hz * 2]}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial
                    color={color}
                    transparent
                    opacity={opacity}
                />
            </mesh>
        );
    return null;
}