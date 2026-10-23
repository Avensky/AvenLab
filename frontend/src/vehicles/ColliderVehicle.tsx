import { memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { VehicleColliderShape } from "../store/networkStore";
import { useVehiclePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";

// Shapes and all transforms come from Rust. This preview requests no debug data.
export const ColliderVehicle = memo(function ColliderVehicle({ id, shape, solid = false }: {
  id: string; shape: VehicleColliderShape; solid?: boolean;
}) {
  const chassis = useRef<Group>(null);
  const wheels = useRef<(Group | null)[]>([]);
  const { getInterpolated } = useVehiclePhysicsInterpolator(id);
  useFrame(() => {
    const pose = getInterpolated(id);
    if (!pose || !chassis.current) return;
    chassis.current.position.fromArray(pose.position);
    chassis.current.quaternion.fromArray(pose.rotation);
    for (const [index, wheel] of (pose.wheels ?? []).entries()) {
      const root = wheels.current[index];
      if (!root) continue;
      root.position.fromArray(wheel.position);
      root.quaternion.fromArray(wheel.rotation);
    }
  });
  return <group name={`collider-vehicle-${id}`}>
    <group ref={chassis}>
      <mesh position={shape.chassis_offset} scale={shape.chassis_half_extents.map((v) => v * 2) as [number, number, number]}>
        <boxGeometry />
        <meshBasicMaterial color="#38bdf8" wireframe={!solid} />
      </mesh>
    </group>
    {Array.from({ length: shape.wheel_count }, (_, index) => <group key={index} ref={(node) => { wheels.current[index] = node; }}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[shape.wheel_radius, shape.wheel_radius, shape.wheel_radius * 0.6, 12]} />
        <meshBasicMaterial color="#fbbf24" wireframe={!solid} />
      </mesh>
    </group>)}
  </group>;
});
