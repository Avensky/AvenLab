import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";
import { Group } from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { getTankParts } from "./tools/getTankParts";
import { useNetworkStore } from "../store/session/networkStore";
import { useUIStore } from "../store/menus/uiStore";
import { useVehiclePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import { useVehicleVisualAlignment } from "../hooks/useVehicleVisualAlignment";

interface TankProps extends PropsWithChildren {
  entityId?: string;
  turretRotation?: number;
  cannonElevation?: number;
}
const MODEL_PATH = "/models/vehicles/tank.glb";
export const Tank = forwardRef<Group, TankProps>(function Tank(
  { children, entityId, turretRotation = 0, cannonElevation = 0 },
  ref,
) {
  const { scene } = useGLTF(MODEL_PATH);
  const root = useRef<Group>(null!);
  const visual = useRef<Group>(null!);
  const turret = useRef<Group | null>(null);
  const cannon = useRef<Group | null>(null);
  useImperativeHandle(ref, () => root.current, []);
  const localId = useNetworkStore((s) => s.playerId);
  const preview = useUIStore(
    (s) => s.screen === "sandbox_setup" || s.screen === "signal_recon_setup",
  );
  const { model, parts, turretY, cannonX } = useMemo(() => {
    const model = scene.clone(true);
    const parts = getTankParts(model);
    return {
      model,
      parts,
      turretY: parts.turret?.rotation.y ?? 0,
      cannonX: parts.cannon?.rotation.x ?? 0,
    };
  }, [scene]);
  useLayoutEffect(() => {
    turret.current = parts.turret;
    cannon.current = parts.cannon;
  }, [parts]);
  useVehicleVisualAlignment("tank", entityId, visual, parts.wheels, preview);
  const { getInterpolated } = useVehiclePhysicsInterpolator(entityId);
  useFrame(() => {
    if (preview || !root.current) return;
    const pose = getInterpolated(entityId ?? localId);
    if (!pose) return;
    root.current.position.fromArray(pose.position);
    root.current.quaternion.fromArray(pose.rotation);
    if (turret.current) turret.current.rotation.y = turretY + turretRotation;
    if (cannon.current) cannon.current.rotation.x = cannonX + cannonElevation;
  });
  return (
    <group ref={root}>
      <group ref={visual}>
        <primitive object={model} />
      </group>
      {children}
    </group>
  );
});
export default Tank;
