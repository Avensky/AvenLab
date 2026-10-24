import { MathUtils, type Group, type MeshBasicMaterial } from "three";
import type { WheelSnapshot } from "../../store/networkStore";
import type { DebugPlayerScope } from "../../store/debugViewStore";
import { DebugFlags, hasDebugFlag } from "../../store/tools/debugMasks.ts";

// A diagnostic part replaces its cheap preview for the same players only.
// Keep this independent of streamed debug packets so toggling flags is immediate.
export function colliderPreviewParts(id: string, localPlayerId: string, scope: DebugPlayerScope, mask: number) {
  const inScope = Boolean(localPlayerId) && (scope === "all" || id === localPlayerId);
  return {
    chassis: !(inScope && hasDebugFlag(mask, DebugFlags.CHASSIS)),
    wheels: !(inScope && hasDebugFlag(mask, DebugFlags.WHEELS)),
  };
}

export function applyColliderWheelPose(
  carrier: Group, spin: Group | null, material: MeshBasicMaterial | null,
  wheel: WheelSnapshot, angle: number, delta: number,
) {
  // Backend rotation already contains steering. Visual spin lives on a child
  // group, exactly once, leaving the authoritative carrier pose unchanged.
  carrier.position.fromArray(wheel.position);
  carrier.quaternion.fromArray(wheel.rotation);
  const nextAngle = MathUtils.euclideanModulo(
    angle + (wheel.wheel_speed ?? 0) * Math.max(0, Math.min(delta, 0.05)), Math.PI * 2,
  );
  if (spin) spin.rotation.x = nextAngle;
  // Ordinary snapshots contain contact state; slip/load colors require debug.
  material?.color.set(wheel.grounded === undefined ? "#fbbf24" : wheel.grounded ? "#22c55e" : "#ef4444");
  return nextAngle;
}
