import type { PhysicsEntitySnapshot } from "../store/networkStore";
import type { MapSnapshot } from "../store/worldStore";

export type PlayerLocation = {
  position: [number, number, number];
  chunk: [number, number] | null;
  local: [number, number, number] | null;
  yaw: number;
};

// Use the authoritative pose, not the camera or the interpolated display pose.
// Chunk origins are centers in this map, so floor(x / cell) is not correct.
export function playerLocation(entity: Pick<PhysicsEntitySnapshot, "position" | "rotation"> | null | undefined,
  map: Pick<MapSnapshot, "chunks" | "cell"> | null): PlayerLocation | null {
  if (!entity || !entity.position.every(Number.isFinite) || !entity.rotation.every(Number.isFinite)) return null;
  const position: PlayerLocation["position"] = [...entity.position];
  const chunk = map?.chunks.find((c) => position[0] >= c.origin[0] - map.cell[0] / 2 && position[0] < c.origin[0] + map.cell[0] / 2
    && position[2] >= c.origin[2] - map.cell[1] / 2 && position[2] < c.origin[2] + map.cell[1] / 2);
  const [x, y, z, w] = entity.rotation;
  // Heading of the vehicle's -Z forward axis projected onto the X/Z ground.
  const norm = x * x + y * y + z * z + w * w;
  const yaw = norm > 0 ? Math.atan2(2 * (x * z + w * y), norm - 2 * (x * x + y * y)) : 0;
  return { position, chunk: chunk ? [chunk.x, chunk.z] : null,
    local: chunk ? [position[0] - chunk.origin[0], position[1] - chunk.origin[1], position[2] - chunk.origin[2]] : null, yaw };
}

export function spawnJson(location: PlayerLocation) {
  if (!location.chunk || !location.local) return null;
  const round = (n: number) => Number(n.toFixed(3));
  return JSON.stringify({ chunk: location.chunk, local: [round(location.local[0]), round(location.local[2])], yaw: round(location.yaw) }, null, 2);
}
