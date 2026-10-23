import { useRef } from "react";
import type { Group } from "three";
import { useFrame } from "@react-three/fiber";
import type { DebugChassis } from "../../store/networkStore";
import { useVehiclePhysicsInterpolator } from "../../hooks/usePhysicsInterpolator";
import { GeometryVisualizer } from "../../vehicles/GeometryVisualizer";
import { ChassisCollider } from "./ChassisCollider";

export function DebugChassisPose({ chassis, mode }: { chassis: DebugChassis; mode: "geometry" | "collider" }) {
  const root = useRef<Group | null>(null);
  const { getInterpolated } = useVehiclePhysicsInterpolator(chassis.player_id);
  useFrame(() => {
    if (!root.current) return;
    const pose = getInterpolated(chassis.player_id);
    // The backend supplies the pose in both modes. Interpolation changes only
    // presentation; legacy/missing snapshot data can still display raw debug.
    root.current.position.fromArray(pose?.position ?? chassis.position);
    root.current.quaternion.fromArray(pose?.rotation ?? chassis.rotation);
  });
  return (
    <group ref={root} name={`debug-chassis-${chassis.player_id}`} position={chassis.position} quaternion={chassis.rotation}>
      {mode === "geometry"
        ? <GeometryVisualizer chassis={chassis} mode={mode} color="white" opacity={0.5} />
        : <ChassisCollider scale={chassis.half_extents.map((value) => value * 2) as [number, number, number]} />}
    </group>
  );
}
