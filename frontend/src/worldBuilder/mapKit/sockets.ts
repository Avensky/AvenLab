import type { LayoutObject, V3 } from "../document/layoutDocument.ts";
import { kitAsset, type KitAsset, type Socket } from "./catalog.ts";

function rotate(p: V3, yaw: number): V3 {
  const a = (yaw * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
}
function socketFrame(item: LayoutObject, asset: KitAsset, socket: Socket) {
  const scale = item.size.map((v, i) => v / asset.size[i]);
  const local = socket.position.map((v, i) => v * scale[i]) as V3;
  const [x, z] = socket.forwardXZ;
  // Compute the heading perpendicular to the scaled mouth, including nonuniform resizing.
  const widthFactor = Math.hypot(z * scale[0], x * scale[2]);
  return {
    local,
    heading: (Math.atan2(x * scale[2], z * scale[0]) * 180) / Math.PI,
    width: socket.widthM * widthFactor,
  };
}
export function worldSocket(
  item: LayoutObject,
  asset: KitAsset,
  socket: Socket,
) {
  const frame = socketFrame(item, asset, socket);
  const offset = rotate(frame.local, item.yaw);
  return {
    position: item.position.map((v, k) => v + offset[k]) as V3,
    heading: item.yaw + frame.heading,
    width: frame.width,
  };
}
type SocketHit = {
  position: V3;
  yaw: number;
  distance: number;
  id: string;
  lock: { kind: "socket"; moving: number; fixed: number };
};
export function snapKitSockets(
  item: LayoutObject,
  desired: V3,
  objects: LayoutObject[],
  radius: number,
) {
  const asset = kitAsset(item.piece);
  if (!asset?.sockets.length) return null;
  let best: SocketHit | null = null;
  for (const other of objects) {
    if (other.id === item.id) continue;
    const fixed = kitAsset(other.piece);
    if (!fixed?.sockets.length) continue;
    for (const [i, input] of asset.sockets.entries()) {
      const a = socketFrame(item, asset, input),
        current = rotate(a.local, item.yaw);
      for (const [j, target] of fixed.sockets.entries()) {
        const b = socketFrame(other, fixed, target);
        if (
          Math.abs(a.width - b.width) >
          Math.max(0.2, 0.05 * Math.min(a.width, b.width))
        )
          continue;
        const offset = rotate(b.local, other.yaw);
        const anchor = other.position.map((v, k) => v + offset[k]) as V3;
        const dx = anchor[0] - desired[0] - current[0],
          dz = anchor[2] - desired[2] - current[2];
        const planar = Math.hypot(dx, dz),
          vertical = Math.abs(anchor[1] - desired[1] - current[1]);
        if (planar > radius || vertical > Math.max(22, radius)) continue;
        const yaw =
          ((((other.yaw + b.heading - a.heading + (i === j ? 180 : 0) + 540) %
            360) +
            360) %
            360) -
          180;
        const turn = Math.abs(
          ((((yaw - item.yaw + 540) % 360) + 360) % 360) - 180,
        );
        const distance = planar + 0.1 * vertical + 0.002 * turn;
        if (best && distance >= best.distance) continue;
        const local = rotate(a.local, yaw);
        best = {
          position: anchor.map((v, k) => v - local[k]) as V3,
          yaw,
          distance,
          id: other.id,
          lock: { kind: "socket", moving: i, fixed: j },
        };
      }
    }
  }
  return best;
}
