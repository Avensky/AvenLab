import { useSnapshotStore } from "../store/snapshotStore";
import { DebugAntiRollBarVisualizer } from "./DebugAntiRollBarVisualizer";
import { DebugLateralForceVisualizer } from "./DebugLateralForceVisualizer";
import { DebugLoadBarVisualizer } from "./DebugLoadBarVisualizer";
import { DebugNormalForceVisualizer } from "./DebugNormalForceVisualizer";
import { DebugRayVisualizer } from "./DebugRayVisualizer";
import { DebugSlipAngleVisualizer } from "./DebugSlipAngleVisualizer";
import { DebugSpringVisualizer } from "./DebugSpringVisualizer";
import { DebugWheelVisualizer } from "./DebugWheelVisualizer";
import * as THREE from "three";



export function DebugVisualizer() {
    const debug = useSnapshotStore(s => s.debug);

    if (!debug) return null;

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


    return (
        <>
            <DebugAntiRollBarVisualizer links={debug.arb_links} />
            <DebugLoadBarVisualizer bars={loadBars} radius={0.07} />
            {/* <DebugRayVisualizer rays={suspensionRays} /> */}
            <DebugSlipAngleVisualizer slips={debug.slip_vectors} />
            <DebugWheelVisualizer wheels={debug.wheels} chassis_right={debug.chassis_right} />
            <DebugSpringVisualizer springs={springs} opacity1={0.8} opacity2={0.3} />
            <DebugNormalForceVisualizer wheels={debug.wheels} />
            <DebugLateralForceVisualizer wheels={debug.wheels} />
        </>
    );
}

