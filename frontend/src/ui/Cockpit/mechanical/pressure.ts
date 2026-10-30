/** A quick tap releases the latch for drifting. A deliberate hold starts a
 * continuous pull after this tap window, adding to the existing cable force. */
export const PARKING_TAP_MS = 180;
export const PARKING_PULL_MS = 600;
export function parkingPressureAfterHold(start: number, elapsedMs: number) {
  const initial = Number.isFinite(start) ? Math.max(0, Math.min(1, start)) : 0;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  return Math.min(1, initial + elapsed / PARKING_PULL_MS);
}
