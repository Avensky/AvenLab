// src/components/VehicleScene.tsx

import { useFrame } from "@react-three/fiber";
import { DebugWheelVisualizer } from "../components/DebugWheelVisualizer";
import { GeometryVisualizer } from "../components/GeometryVisualizer";
import { GLBVisualizer } from "../components/GLBVisualizer";
import { useSnapshotStore } from "../store/store";
import { useRef } from "react";
import * as THREE from "three";
import { DebugAntiRollBarVisualizer } from "../components/DebugAntiRollBarVisualizer";
// import { DebugLoadBarVisualizer } from "../components/DebugLoadBarVisualizer";
import { DebugSlipAngleVisualizer } from "../components/DebugSlipAngleVisualizer";
import { DebugSpringVisualizer } from "../components/DebugSpringVisualizer";
import { ChassisCollider } from "../components/debugger/ChassisCollider";
// import { DebugNormalForceVisualizer } from "../components/DebugNormalForceVisualizer";
// import { DebugLateralForceVisualizer } from "../components/DebugLateralForceVisualizer";

export function VehicleScene() {
    const ref = useRef<THREE.Group>(null);

    const snapshot = useSnapshotStore((s) => s.snapshot);
    const playerId = useSnapshotStore((s) => s.playerId);
    const debug = useSnapshotStore((s) => s.debug);
    const mode = useSnapshotStore((s) => s.mode);
    const me = useSnapshotStore((s) => s.getMe());
    // const physics = useSnapshotStore((s) => s.physicsData);

    // -----------------------------
    // Frame sync
    // -----------------------------
    useFrame(() => {
        if (!ref.current || !me) return;

        const [x, y, z] = me.position;
        ref.current.position.set(x, y, z);

        const [qx, qy, qz, qw] = me.rotation;
        ref.current.quaternion.set(qx, qy, qz, qw);
    });

    if (!snapshot || !playerId || !me) return null;
    if (!debug) return null;

    // -----------------------------
    // Springs
    // -----------------------------
    const springs = debug.suspension_rays
        .map((r, i) => {
            const wheel = debug.wheels[i];
            if (!r.hit || !wheel) return null;

            const normal = new THREE.Vector3(0, 1, 0);
            const hit = new THREE.Vector3(...r.hit);

            const end = hit.clone().add(normal.multiplyScalar(wheel.radius));
            const start = new THREE.Vector3(...r.origin);

            const restEnd = start
                .clone()
                .addScaledVector(normal, -(r.length - wheel.radius));

            const length = start.distanceTo(end);
            const ratio = 1 - Math.min(length / r.length, 1);

            return {
                start: start.toArray() as [number, number, number],
                end: end.toArray() as [number, number, number],
                restEnd: restEnd.toArray() as [number, number, number],
                ratio,
            };
        })
        .filter(Boolean) as {
            start: [number, number, number];
            end: [number, number, number];
            restEnd: [number, number, number];
            ratio: number;
        }[];

    // -----------------------------
    // Optional: physics-driven animation hooks
    // -----------------------------
    // useFrame(() => {
    //     if (!physics) return;

    //     // Example hooks (future use)
    //     // engine vibration
    //     // exhaust animation
    //     // dashboard needle
    //     // camera shake

    //     // console.log("RPM:", physics.rpm, "Speed:", physics.speed);
    // });

    return (<>
        {/* WORLD DEBUG (not parented to player/follow group) */}
        {/* {mode === "glb" && <DebugColliders boxes={debug.block_boxes} />} */}
        {/* {mode === "collider" && <DebugColliders boxes={debug.block_boxes} />} */}
        {/* {mode === "hybrid" && <DebugColliders boxes={debug.block_boxes} />} */}

        {/* PLAYER DEBUG */}
        <group ref={ref}>
            {mode === "geometry" && (
                <>
                    <DebugWheelVisualizer
                        wheels={debug.wheels}
                        vehiclePosition={me.position}
                        vehicleQuaternion={me.rotation}
                    />

                    <GeometryVisualizer
                        chassis={debug.chassis}
                        color="white"
                        opacity={0.5}
                        mode={mode}
                    />

                    <DebugAntiRollBarVisualizer links={debug.arb_links} />

                    <DebugSlipAngleVisualizer
                        slips={debug.slip_vectors}
                        vehiclePosition={me.position}
                        vehicleQuaternion={me.rotation}
                    />

                    <DebugSpringVisualizer
                        springs={springs}
                        opacity1={0.8}
                        opacity2={0.3}
                        vehiclePosition={me.position}
                        vehicleQuaternion={me.rotation}
                    />
                </>
            )}

            {mode === "collider" && (<>
                <DebugWheelVisualizer
                        wheels={debug.wheels}
                        vehiclePosition={me.position}
                        vehicleQuaternion={me.rotation}
                />

                {/* <DebugColliders boxes={debug.block_boxes} /> */}

                <ChassisCollider
                    scale={
                        debug.chassis
                            ? debug.chassis.half_extents.map(v => v * 2) as [number, number, number]
                            : undefined
                    }
                />
            </>)}

             {mode === "hybrid" && (<>
                <DebugWheelVisualizer
                        wheels={debug.wheels}
                        vehiclePosition={me.position}
                        vehicleQuaternion={me.rotation}
                />
                <ChassisCollider
                    scale={
                        debug.chassis
                            ? debug.chassis.half_extents.map(v => v * 2) as [number, number, number]
                            : undefined
                    }
                />
            </>)}

            {mode === "glb" && (
                <GLBVisualizer
                    scale={
                        debug.chassis
                            ? debug.chassis.half_extents.map(v => v * 2) as [number, number, number]
                            : undefined
                    }
                />
            )}
        </group>

    </>);
}

