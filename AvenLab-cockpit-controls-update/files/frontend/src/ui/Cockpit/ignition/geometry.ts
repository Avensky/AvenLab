/** Key detents are independent from world/vehicle angles. SVG rotates around
 * (60,60); labels sit at radius 54, the full light ring outside them at 61. */
export const IGNITION_ANGLES = [-135, -90, -45, 0] as const;
export const IGNITION_POSITIONS = ["OFF", "ACC", "ON", "START"] as const;
export const IGNITION_LABEL_RADIUS = 54;
export const IGNITION_RING_RADIUS = 61;

/** The view box follows the outer light, so increasing its radius never clips
 * the halo or moves OFF/ACC/ON/START to a different angular reference. */
export function ignitionViewBox() {
  const padding = IGNITION_RING_RADIUS + 3;
  return `${60 - padding} ${60 - padding} ${padding * 2} ${padding * 2}`;
}

/** The held detent sweep follows the same outer ring instead of the old arc
 * between the key cylinder and its labels. SVG pathLength normalizes it to 3. */
export function ignitionTravelPath() {
  const angle = (IGNITION_ANGLES[0] * Math.PI) / 180;
  const radius = IGNITION_RING_RADIUS;
  return `M${60 + radius * Math.cos(angle)} ${60 + radius * Math.sin(angle)}A${radius} ${radius} 0 0 1 ${60 + radius} 60`;
}
