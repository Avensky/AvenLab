// src/components/NetworkVehicleScene.tsx

import { useSnapshotStore, type PlayerSnapshot } from "../store/snapshotStore";
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
    p: PlayerSnapshot;
    mode: string;
}) {
    const ref = useRef<THREE.Group>(null);
    const debug = useSnapshotStore(s => s.debug);

    useFrame(() => {
        // if (!ref.current || !p.debug?.chassis) return;
        if (!ref.current) return;


        // position

        // authoritative physics transform
        ref.current.position.set(p.x, p.y, p.z);

        // rotation (physics-authoritative)
        if (p.rot && p.rot.length === 4) {
            ref.current.quaternion.set(
                p.rot[0],
                p.rot[1],
                p.rot[2],
                p.rot[3]
            );
        } else if (p.yaw !== undefined) {
            ref.current.rotation.set(0, p.yaw, 0);
        }
    });

    return (
        <group ref={ref}>
            {mode === "geometry" && (
                <GeometryVisualizer
                    chassis={debug?.chassis}
                    mode={mode}
                />
            )}

            {mode === "collider" && (
                <ColliderVisualizer
                    scale={
                        debug?.chassis
                            ? debug.chassis.half_extents.map(v => v * 2) as [number, number, number]
                            : undefined
                    }
                />
            )}

            {mode === "glb" && (
                <GLBVisualizer
                    scale={
                        debug?.chassis
                            ? debug.chassis.half_extents.map(v => v * 2) as [number, number, number]
                            : undefined
                    }
                />
            )}
        </group>
    );
}
