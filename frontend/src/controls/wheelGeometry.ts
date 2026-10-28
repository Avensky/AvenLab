export const MAX_WHEEL_ANGLE = 135;
export function wheelPoint(dx: number, dy: number, radius: number) {
  if (![dx, dy, radius].every(Number.isFinite) || radius <= 0) return { x: 0, y: 0 };
  const length = Math.hypot(dx, dy), scale = length > radius ? radius / length : 1;
  return { x: dx * scale / radius, y: dy * scale / radius };
}
