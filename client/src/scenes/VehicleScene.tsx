// src/components/VehicleScene.tsx

import { useFrame } from "@react-three/fiber";
import { ColliderVisualizer } from "../components/ColliderVisualizer";
import { DebugWheelVisualizer } from "../components/DebugWheelVisualizer";
import { GeometryVisualizer } from "../components/GeometryVisualizer";
import { GLBVisualizer } from "../components/GLBVisualizer";
import { useSnapshotStore } from "../store/store";
import { useRef } from "react";
import * as THREE from "three";

export function VehicleScene() {
    const ref = useRef<THREE.Group>(null);

    const snapshot = useSnapshotStore((s) => s.snapshot);
    const playerId = useSnapshotStore((s) => s.playerId);
    if (!snapshot || !playerId) return null;

    const debug = useSnapshotStore.getState().debug;
    if (!debug) return null;

    const mode = useSnapshotStore.getState().mode;

    // After this line players is guaranteed valid
    // const others = snapshot.players.filter((p) => me.id !== playerId);

    const me = useSnapshotStore.getState().getMe();
    if (!me) return null;
    useFrame(() => {
        if (!ref.current || !me) return;

        ref.current.position.set(me.x, me.y, me.z);

        if (me.rot?.length === 4) {
            ref.current.quaternion.set(
                me.rot[0],
                me.rot[1],
                me.rot[2],
                me.rot[3]
            );
        } else if (me.yaw !== undefined) {
            ref.current.rotation.set(0, me.yaw, 0);
        }
    });

    return (<>
        {/* <DebugWheelVisualizer
            wheels={debug.wheels}
            chassis_right={debug.chassis_right}
        /> */}
        <group ref={ref}>
            {mode === "geometry" && debug && (
                <>
                    <DebugWheelVisualizer
                        wheels={debug.wheels}
                        vehiclePosition={[me.x, me.y, me.z]}
                        vehicleQuaternion={me.rot}
                    />

                    <GeometryVisualizer
                        chassis={debug?.chassis}
                        color={'white'}
                        opacity={0.5}
                        mode={mode}
                    />
                </>
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
    </>

    );
}

