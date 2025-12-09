import { ColliderVisualizer } from "../components/ColliderVisualizer";
import { GeometryVisualizer } from "../components/GeometryVisualizer";
import { GLBVisualizer } from "../components/GLBVisualizer";
import { useSnapshotStore } from "../store/snapshotStore";
// import { useEffect, useRef } from "react";
// import { Group } from "three";

export function NetworkWorld() {
    // const refs = useRef<{ [id: string]: Group }>({});
    const playerId = useSnapshotStore(s => s.playerId);
    const snapshot = useSnapshotStore(s => s.snapshot);
    const others = snapshot?.players?.filter(p => p.id !== playerId) ?? [];
    const mode = useSnapshotStore((s) => s.mode);

    return (
        <>
            {others.map(player => (
                <group
                    key={player.id}
                    // ref={el => {
                    //     if (el) refs.current[player.id] = el;
                    //     if (el) el.position.set(player.x, player.y, player.z);
                    // }}
                    position={[player.x, player.y, player.z]}
                >
                    {/* <mesh>
                        <boxGeometry args={[1, 1, 2]} />
                        <meshStandardMaterial color={"cyan"} />
                    </mesh> */}
                    {mode === "glb" && <GLBVisualizer type={"car"} />}
                    {mode === "geometry" && <GeometryVisualizer color="cyan" />}
                    {mode === "collider" && <ColliderVisualizer color="cyan" />}
                </group>
            ))}
        </>
    );
}
