import { memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, MeshBasicMaterial } from "three";
import { useNetworkStore, type VehicleColliderShape } from "../store/networkStore";
import { useWorldStore } from "../store/worldStore";
import { useDebugViewStore } from "../store/debugViewStore";
import { useVehiclePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { applyColliderWheelPose, colliderPreviewParts } from "./tools/colliderPreview";

// Shapes and all transforms come from Rust. This preview requests no debug data.
export const ColliderVehicle = memo(function ColliderVehicle({ id, shape, solid = false }: {
  id: string; shape: VehicleColliderShape; solid?: boolean;
}) {
  const localPlayerId = useNetworkStore((s) => s.playerId);
  const scope = useDebugViewStore((s) => s.playerScope);
  const debugMask = useWorldStore((s) => s.debugMask);
  const parts = colliderPreviewParts(id, localPlayerId, scope, debugMask);
  const chassis = useRef<Group>(null);
  const wheels = useRef<(Group | null)[]>([]);
  const spins = useRef<(Group | null)[]>([]);
  const materials = useRef<(MeshBasicMaterial | null)[]>([]);
  const angles = useRef<number[]>([]);
  const { getInterpolated } = useVehiclePhysicsInterpolator(id);
  useFrame((_, delta) => {
    if (!parts.chassis && !parts.wheels) return;
    const pose = getInterpolated(id);
    if (!pose) return;
    // Hiding the baseline chassis must not stop the remaining wheels updating.
    if (chassis.current) {
      chassis.current.position.fromArray(pose.position);
      chassis.current.quaternion.fromArray(pose.rotation);
    }
    if (!parts.wheels) return;
    for (const [index, wheel] of (pose.wheels ?? []).entries()) {
      const carrier = wheels.current[index];
      if (!carrier) continue;
      angles.current[index] = applyColliderWheelPose(
        carrier, spins.current[index], materials.current[index], wheel, angles.current[index] ?? 0, delta,
      );
    }
  });
  return <group name={`collider-vehicle-${id}`}>
    {parts.chassis && <group ref={chassis} name={`preview-chassis-${id}`}>
      <mesh position={shape.chassis_offset} scale={shape.chassis_half_extents.map((v) => v * 2) as [number, number, number]}>
        <boxGeometry />
        <meshBasicMaterial color="#38bdf8" wireframe={!solid} />
      </mesh>
    </group>}
    {parts.wheels && Array.from({ length: shape.wheel_count }, (_, index) => <group key={index}
      name={`preview-wheel-${id}-${index}`} ref={(node) => { wheels.current[index] = node; }}>
      <group ref={(node) => { spins.current[index] = node; }}>
        {/* Cylinder axle Y -> backend local X is the fixed mesh basis. */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[shape.wheel_radius, shape.wheel_radius, shape.wheel_radius * 0.6, 12]} />
          <meshBasicMaterial ref={(material) => { materials.current[index] = material; }} color="#fbbf24" wireframe={!solid} />
        </mesh>
      </group>
    </group>)}
  </group>;
});
