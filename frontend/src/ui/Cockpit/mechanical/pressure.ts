/** Cable force increases only while held. Keeping the starting fraction makes
 * short subsequent pulls add pressure rather than accidentally releasing it. */
export const PARKING_PULL_MS = 1200;
export function parkingPressureAfterHold(start: number, elapsedMs: number) {
  const initial = Number.isFinite(start) ? Math.max(0, Math.min(1, start)) : 0;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  return Math.min(1, initial + elapsed / PARKING_PULL_MS);
}
