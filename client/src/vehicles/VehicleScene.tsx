// src/components/VehicleScene.tsx

import { useFrame } from "@react-three/fiber";
import { DebugWheelVisualizer } from "../components/debugger/DebugWheelVisualizer";
import { GeometryVisualizer } from "./GeometryVisualizer";
import { useRef } from "react";
import * as THREE from "three";
import { useNetworkStore, useWorldStore } from "../store";
import { DebugAntiRollBarVisualizer } from "../components/debugger/DebugAntiRollBarVisualizer";
import { DebugSlipAngleVisualizer } from "../components/debugger/DebugSlipAngleVisualizer";
import { DebugSpringVisualizer } from "../components/debugger/DebugSpringVisualizer";
import { ChassisCollider } from "../components/debugger/ChassisCollider";
// import { DebugLoadBarVisualizer } from "../components/DebugLoadBarVisualizer";
// import { DebugNormalForceVisualizer } from "../components/DebugNormalForceVisualizer";
// import { DebugLateralForceVisualizer } from "../components/DebugLateralForceVisualizer";

export function VehicleScene() {
    const ref = useRef<THREE.Group>(null);

    const snapshot = useNetworkStore((s) => s.snapshot);
    const playerId = useNetworkStore((s) => s.playerId);
    const debug = useNetworkStore((s) => s.debugOverlay);
    const mode = useWorldStore((s) => s.mode);
    const me = useNetworkStore((s) => s.getMe());
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
                            ? debug.chassis.half_extents.map((v: number) => v * 2) as [number, number, number]
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
                            ? debug.chassis.half_extents.map((v: number) => v * 2) as [number, number, number]
                            : undefined
                    }
                />
            </>)}

        </group>

    </>);
}

