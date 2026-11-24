/** Screen-space hysteresis avoids tiny occupants and flickering at a distance.
 * Perspective, orthographic, and scoped cameras all use the same pixel test. */
export function driverVisible(pixels: number, inView: boolean, previous: boolean, lowDetail = false) {
  if (!inView || !Number.isFinite(pixels)) return false;
  const enter = lowDetail ? 12 : 8;
  return pixels >= enter * (previous ? .72 : 1);
}
