// src/components/GeomeryVisualizer.tsx
// chassis

import type { DebugChassis } from "../store/store";
import { ColliderVisualizer } from "./ColliderVisualizer";
import { GLBVisualizer } from "./GLBVisualizer";

export function GeometryVisualizer({
    chassis,
    mode,
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

    // const scale = new THREE.Vector3(
    //     hx * 2,
    //     hy * 2,
    //     hz * 2
    // );

    if (mode === "geometry") {
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
    }

    if (mode === "collider") {
        return <ColliderVisualizer scale={[hx * 2, hy * 2, hz * 2]} />;
    }

    if (mode === "glb") {
        return <GLBVisualizer scale={[hx * 2, hy * 2, hz * 2]} />;
    }

    return null;
}