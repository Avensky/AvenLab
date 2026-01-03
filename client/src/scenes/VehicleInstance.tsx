import { useSnapshotStore, type PlayerSnapshot } from "../store/store";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLBVisualizer } from "../components/GLBVisualizer";
import { GeometryVisualizer } from "../components/GeometryVisualizer";
import { ColliderVisualizer } from "../components/ColliderVisualizer";

export default function VehicleInstance({
    p,
    mode,
    color
}: {
    p: PlayerSnapshot;
    mode: string;
    color: string;
}) {
    const ref = useRef<THREE.Group>(null);
    const debug = useSnapshotStore(s => s.debug);

    const flSteer = useRef<THREE.Group>(null);
    const frSteer = useRef<THREE.Group>(null);

    const input = useSnapshotStore(s => s.input); // or wherever ctrl lives

    useFrame(() => {
        // if (!ref.current || !p.debug?.chassis) return;
        if (!ref.current) return;

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

        // ---- FRONT WHEEL STEERING (VISUAL ONLY) ----
        if (flSteer.current && frSteer.current && input) {
            const MAX_STEER = Math.PI / 6;
            const steer = input.steer ?? 0;
            const angle = steer * MAX_STEER;

            flSteer.current.rotation.y = angle;
            frSteer.current.rotation.y = angle;
            flSteer.current.rotation.y = THREE.MathUtils.lerp(
                flSteer.current.rotation.y,
                angle,
                0.2
            );
        }



    });

    return (
        <group ref={ref}>
            {mode === "geometry" && debug && (<>
                <GeometryVisualizer
                    chassis={debug?.chassis}
                    mode={mode}
                    color={color}
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
    );
}
