import { useSnapshotStore } from "../store/snapshotStore";
import { GLBVisualizer } from "./GLBVisualizer";
import { GeometryVisualizer } from "./GeometryVisualizer";
import { ColliderVisualizer } from "./ColliderVisualizer";

export function WorldRenderer() {
    const bodies = useSnapshotStore((s) => s.bodies);
    const mode = useSnapshotStore((s) => s.mode);

    return (
        <>
            {bodies.map((b) => {
                const pos = [b.x, b.y, b.z] as const;
                const rot = [b.qx, b.qy, b.qz, b.qw] as const;

                return (
                    <group key={b.id} position={pos} quaternion={rot}>
                        {mode === "glb" && <GLBVisualizer />}
                        {mode === "geometry" && <GeometryVisualizer />}
                        {mode === "collider" && <ColliderVisualizer />}
                    </group>
                );
            })}
        </>
    );
}
