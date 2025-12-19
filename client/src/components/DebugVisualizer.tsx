import { useSnapshotStore } from "../store/snapshotStore";
import { DebugRayVisualizer } from "./DebugRayVisualizer";
import { DebugSpringVisualizer } from "./DebugSpringVisualizer";
import { DebugWheelVisualizer } from "./DebugWheelVisualizer";
import * as THREE from "three";

export function DebugVisualizer() {
    const debug = useSnapshotStore(s => s.debug);

    if (!debug) return null;

    const springs = debug.rays
        .map((r, i) => {
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
        })
        .filter((s): s is {
            start: [number, number, number];
            end: [number, number, number];
            restEnd: [number, number, number];
            ratio: number;
        } => s !== null);


    const raysWithRatio = debug.rays.map(r => {
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

    return (
        <>
            <DebugRayVisualizer
                rays={raysWithRatio}
            />
            <DebugWheelVisualizer
                wheels={debug.wheels}
                chassis_right={debug.chassis_right}
            />
            <DebugSpringVisualizer
                springs={springs}
            />

        </>
    );
}

