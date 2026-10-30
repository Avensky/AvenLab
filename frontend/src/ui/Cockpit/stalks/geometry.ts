/** A single polar layout owns the cap and both neighboring direction buttons.
 * Radius is a percentage of wheel width, not pixels. Keep all three on one arc. */
export const STALK_LAYOUTS = {
  lights: { angle: 120, reach: 34.5, spacing: 13 },
  wipers: { angle: 60, reach: 34.5, spacing: 13 },
  cruise: { angle: 326, reach: 34.5, spacing: 13 },
} as const;

/** Screen Y points down; a positive polar angle therefore subtracts from Y. */
export function stalkPoint(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    left: `${50 + radius * Math.cos(radians)}%`,
    top: `${50 - radius * Math.sin(radians)}%`,
  };
}

/** On the right side, increasing angle moves up; the left side is mirrored.
 * The old shared subtraction put RES+ below its lever after it moved right. */
export function stalkStepAngle(
  angle: number,
  direction: -1 | 1,
  spacing: number,
) {
  const right = Math.cos((angle * Math.PI) / 180) >= 0;
  return angle + direction * spacing * (right ? 1 : -1);
}

/** Align button faces with the circle while keeping words/icons upright. */
export function stalkTangent(angle: number) {
  return ((((180 - angle) % 180) + 180) % 180) - 90;
}
