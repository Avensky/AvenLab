import { useSnapshotStore } from "../store/snapshotStore";
import { GLBVisualizer } from "./GLBVisualizer";
import { GeometryVisualizer } from "./GeometryVisualizer";
import { ColliderVisualizer } from "./ColliderVisualizer";
import * as THREE from "three";

export function WorldRenderer() {
    const bodies = useSnapshotStore((s) => s.bodies);
    const mode = useSnapshotStore((s) => s.mode);
    const selfId = useSnapshotStore((s) => s.selfId);
    const predictedSelf = useSnapshotStore((s) => s.predictedSelf);

    return (
        <>
            {bodies.map((b) => {
                let position = [b.x, b.y, b.z] as const;
                let quaternion = [b.qx, b.qy, b.qz, b.qw] as const;
                if (selfId && predictedSelf && b.id === selfId) {
                    // override with predicted state
                    position = [predictedSelf.x, predictedSelf.y, predictedSelf.z];

                    const q = new THREE.Quaternion();
                    const euler = new THREE.Euler(0, predictedSelf.yaw, 0, "YXZ");
                    q.setFromEuler(euler);
                    quaternion = [q.x, q.y, q.z, q.w];
                }
                return (
                    <group key={b.id} position={position} quaternion={quaternion}>
                        {mode === "glb" && <GLBVisualizer />}
                        {mode === "geometry" && <GeometryVisualizer />}
                        {mode === "collider" && <ColliderVisualizer />}
                    </group>
                );
            })}
        </>
    );
}
