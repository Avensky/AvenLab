import { useRef } from "react";
import * as THREE from "three";
import type { DebugWheel } from "../../store/networkStore";
import { useFrame } from "@react-three/fiber";
import { useVehiclePhysicsInterpolator } from "../../hooks/usePhysicsInterpolator";

function wheelColor(wheel: DebugWheel) {
  // Force/contact diagnostics remain the raw backend results. OFF displays
  // raw poses as well when inspecting a particular contact tick.
  if (!wheel.grounded) return "#ef4444";
  if (Math.abs(wheel.slip_ratio) > 0.15) return "#d946ef";
  if (Math.abs(wheel.slip_angle) > 0.21) return "#f97316";
  if (Math.abs(wheel.slip_angle) > 0.10) return "#facc15";
  return "#22c55e";
}

function DebugWheelPose({ wheel }: { wheel: DebugWheel }) {
  const root = useRef<THREE.Group | null>(null);
  const spin = useRef<THREE.Group | null>(null);
  const angle = useRef(0);
  const { getInterpolated } = useVehiclePhysicsInterpolator(wheel.player_id);
  useFrame((_, dt) => {
    const pose = getInterpolated(wheel.player_id);
    const sample = wheel.id === undefined ? undefined
      : pose?.wheels?.find((item) => item.id.toLowerCase() === wheel.id!.toLowerCase());
    // All wheel carriers and chassis read the camera's cached frame pose.
    // Backend rotation already includes steering; add visual spin once only.
    if (root.current) {
      root.current.position.fromArray(sample?.position ?? wheel.center);
      root.current.quaternion.fromArray(sample?.rotation ?? wheel.rotation);
    }
    if (spin.current) {
      angle.current = THREE.MathUtils.euclideanModulo(
        angle.current + (sample?.wheel_speed ?? wheel.wheel_speed) * Math.max(0, Math.min(dt, 0.05)), Math.PI * 2,
      );
      spin.current.rotation.x = angle.current;
    }
  });
  return (
    <group ref={root} name={`debug-wheel-${wheel.player_id}-${wheel.id ?? "legacy"}`} position={wheel.center} quaternion={wheel.rotation}>
      <group ref={spin} name={`debug-wheel-spin-${wheel.player_id}-${wheel.id ?? "legacy"}`}>
        {/* Cylinder axle Y -> local X is a fixed geometry basis, not steering. */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[wheel.radius, wheel.radius, wheel.radius * 0.6, 20]} />
          <meshStandardMaterial color={wheelColor(wheel)} wireframe />
        </mesh>
      </group>
    </group>
  );
}

export function DebugWheelVisualizer({ wheels }: { wheels: DebugWheel[] }) {
  return <>{wheels.map((wheel, index) =>
    <DebugWheelPose key={`${wheel.player_id}:${wheel.id ?? index}`} wheel={wheel} />)}</>;
}
