import type { PhysicsEntitySnapshot } from "../store/session/networkStore";

/** Ordinary backend poses suffice: no force diagnostics or GLB inspection. */
export function handlingSample(
  entity: Pick<PhysicsEntitySnapshot, "rotation" | "wheels"> | undefined,
) {
  if (!entity)
    return {
      bodyRollDeg: null,
      airborneWheels: null,
      groundedWheels: null,
      wheelCount: 0,
    };
  const [x, y, z, w] = entity.rotation;
  // Roll about vehicle forward, invariant under world heading. Report absolute
  // magnitude so left/right turns share a meaningful percentile distribution.
  const roll = Math.abs(
    (Math.atan2(2 * (x * y + z * w), 1 - 2 * (x * x + z * z)) * 180) / Math.PI,
  );
  const wheels = entity.wheels ?? [];
  const known =
    wheels.length > 0 &&
    wheels.every((wheel) => typeof wheel.grounded === "boolean");
  const grounded = known
    ? wheels.filter((wheel) => wheel.grounded).length
    : null;
  return {
    bodyRollDeg: Number.isFinite(roll) ? roll : null,
    airborneWheels: grounded === null ? null : wheels.length - grounded,
    groundedWheels: grounded,
    wheelCount: wheels.length,
  };
}
