/** Pure screen geometry for the mechanical console. Coordinates are normalized
 * so the same gate/lever proportions work on the compact HUD and large cockpit. */
// Rest points toward the floor horizon; full cable force is upright. Reach and
// angle grow monotonically so the 100% grip occupies the shifter's full height.
export function parkingLeverPose(level: number) {
  const fraction = Math.max(
    0,
    Math.min(1, Number.isFinite(level) ? level / 3 : 0),
  );
  return {
    angle: -180 + 90 * fraction,
    reach: 0.5 + 0.5 * fraction,
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
