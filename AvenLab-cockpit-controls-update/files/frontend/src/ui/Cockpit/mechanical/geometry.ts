/** Pure screen geometry for the mechanical console. Coordinates are normalized
 * so the same gate/lever proportions work on the compact HUD and large cockpit. */
// Project perpendicular floor/up axes into a receding camera view. Their screen
// angles need not be 90 degrees apart: idle points away, applied rises upright.
export function parkingLeverPose(level: number) {
  const fraction = Math.max(
    0,
    Math.min(1, Number.isFinite(level) ? level / 3 : 0),
  );
  const lift = (fraction * Math.PI) / 2;
  const x =
    Math.cos((-115 * Math.PI) / 180) * Math.cos(lift) +
    Math.cos((-75 * Math.PI) / 180) * Math.sin(lift);
  const y =
    Math.sin((-115 * Math.PI) / 180) * Math.cos(lift) +
    Math.sin((-75 * Math.PI) / 180) * Math.sin(lift);
  return {
    angle: (Math.atan2(y, x) * 180) / Math.PI,
    reach: 0.72 + 0.28 * fraction,
  };
}
export function inNeutralLane(y: number) {
  return Number.isFinite(y) && Math.abs(y - 51) <= 12;
}

export function shiftKnobRoute(
  from: { x: number; y: number },
  to: { x: number; y: number },
  automatic: boolean,
) {
  return automatic
    ? [from, to]
    : [from, { x: from.x, y: 51 }, { x: to.x, y: 51 }, to];
}
