export function blenderPosToThree(
  pos: [number, number, number]
): [number, number, number] {
  const [x, yDepth, zUp] = pos;
  return [x, zUp, yDepth];
}

export function blenderHalfExtentsToThree(
  halfExtents: [number, number, number]
): [number, number, number] {
  const [hx, hyDepth, hzUp] = halfExtents;
  return [hx, hzUp, hyDepth];
}