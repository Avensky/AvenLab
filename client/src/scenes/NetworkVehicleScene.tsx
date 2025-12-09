import { useSnapshotStore } from "../store/snapshotStore";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLBVisualizer } from "../components/GLBVisualizer";
import { GeometryVisualizer } from "../components/GeometryVisualizer";
import { ColliderVisualizer } from "../components/ColliderVisualizer";

export function NetworkVehicleScene() {
    // subscribe to ONLY the raw values
    const snapshot = useSnapshotStore((s) => s.snapshot);
    const playerId = useSnapshotStore((s) => s.playerId);
    const mode = useSnapshotStore((s) => s.mode);
    const me = useSnapshotStore((s) => s.getMe());

    if (!snapshot || !playerId) return null;
    // console.log("snapshot.players ", snapshot)
    // console.log("Rendering me ", me)
    // if (!snapshot.players || snapshot.players.length === 0) return null;
    // console.log("PlayerId ", playerId)

    // After this line players is guaranteed valid
    // const me = snapshot.players.find((p) => p.id === playerId);
    // const others = snapshot.players.filter((p) => p.id !== playerId);
    if (!me) return null;
    return (
        <>
            {me && <VehicleInstance p={me} mode={mode} />}
            {/* {others.map((p) => (
                <VehicleInstance key={p.id} p={p} mode={mode} />
            ))} */}
        </>
    );
}

function VehicleInstance({
    p,
    mode,
}: {
    p: any;
    mode: string;
}) {
    const ref = useRef<THREE.Group>(null);

    useFrame(() => {
        if (!ref.current) return;

        // update stable transform
        ref.current.position.set(p.x, p.y, p.z);

        if (p.yaw !== undefined) {
            ref.current.rotation.set(0, p.yaw, 0);
        }
    });

    return (
        <group ref={ref}>
            {mode === "glb" && <GLBVisualizer />}
            {mode === "geometry" && <GeometryVisualizer />}
            {mode === "collider" && <ColliderVisualizer />}
        </group>
    );
}
