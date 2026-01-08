// src/components/VehicleScene.tsx

import { useFrame } from "@react-three/fiber";
import { ColliderVisualizer } from "../components/ColliderVisualizer";
import { DebugWheelVisualizer } from "../components/DebugWheelVisualizer";
import { GeometryVisualizer } from "../components/GeometryVisualizer";
import { GLBVisualizer } from "../components/GLBVisualizer";
import { useSnapshotStore } from "../store/store";
import { useRef } from "react";
import * as THREE from "three";
import { DebugAntiRollBarVisualizer } from "../components/DebugAntiRollBarVisualizer";
import { DebugLoadBarVisualizer } from "../components/DebugLoadBarVisualizer";
import { DebugSlipAngleVisualizer } from "../components/DebugSlipAngleVisualizer";
import { DebugSpringVisualizer } from "../components/DebugSpringVisualizer";
import { DebugNormalForceVisualizer } from "../components/DebugNormalForceVisualizer";
import { DebugLateralForceVisualizer } from "../components/DebugLateralForceVisualizer";

export function VehicleScene() {
    const ref = useRef<THREE.Group>(null);

    const snapshot = useSnapshotStore((s) => s.snapshot);
    const playerId = useSnapshotStore((s) => s.playerId);
    if (!snapshot || !playerId) return null;

    const debug = useSnapshotStore.getState().debug;
    if (!debug) return null;

    const mode = useSnapshotStore.getState().mode;

    const springs = debug.suspension_rays.map((r, i) => {
        const wheel = debug.wheels[i];
        if (!r.hit || !wheel) return null;

        const normal = new THREE.Vector3(0, 1, 0);
        const hit = new THREE.Vector3(...r.hit);

        // Move spring end UP by wheel radius (important)
        const end = hit.clone().add(normal.multiplyScalar(wheel.radius));
        const start = new THREE.Vector3(...r.origin);
        // 👻 rest-length ghost end
        // rest length ≈ ray.length minus wheel radius
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
    }).filter((s): s is {
        start: [number, number, number];
        end: [number, number, number];
        restEnd: [number, number, number];
        ratio: number;
    } => s !== null);


    // -----------------------------
    // Suspension raycasts
    // -----------------------------
    const suspensionRays = debug.suspension_rays.map(r => {
        if (!r.hit) {
            return { ...r, ratio: 0, airborne: true };
        }

        const dx = r.hit[0] - r.origin[0];
        const dy = r.hit[1] - r.origin[1];
        const dz = r.hit[2] - r.origin[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        return {
            ...r,
            ratio: 1 - Math.min(dist / r.length, 1),
            airborne: false,
        };
    });


    // -----------------------------
    // Load bars (vertical forces)
    // -----------------------------
    const loadBars = debug.load_bars.map(b => ({
        origin: b.origin,
        length: b.length,
        color: b.color,
    }));




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
        <group ref={ref}>
            {mode === "geometry" && debug && (
                <>
                    <DebugWheelVisualizer wheels={debug.wheels} vehiclePosition={[me.x, me.y, me.z]} vehicleQuaternion={me.rot} />
                    <GeometryVisualizer chassis={debug?.chassis} color={'white'} opacity={0.5} mode={mode} />
                    <DebugAntiRollBarVisualizer links={debug.arb_links} />
                    {/* <DebugLoadBarVisualizer bars={loadBars} radius={0.07} /> */}
                    {/* <DebugRayVisualizer rays={suspensionRays} /> */}
                    <DebugSlipAngleVisualizer
                        slips={debug.slip_vectors}
                        vehiclePosition={[me.x, me.y, me.z]}
                        vehicleQuaternion={me.rot}
                    />
                    <DebugSpringVisualizer
                        springs={springs}
                        opacity1={0.8} opacity2={0.3}
                        vehiclePosition={[me.x, me.y, me.z]}
                        vehicleQuaternion={me.rot}
                    />
                    {/* <DebugNormalForceVisualizer wheels={debug.wheels} /> */}
                    {/* <DebugLateralForceVisualizer wheels={debug.wheels} /> */}
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

