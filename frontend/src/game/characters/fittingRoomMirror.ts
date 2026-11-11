import { Shape, ShapeGeometry } from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { gatePlanarReflectionCapture } from "../preview/garageFloorEffects";

export const FITTING_WALL_MIRROR = {
  position: [.85, 1.1, -1.5],
  yaw: -Math.PI / 12,
  width: 1.3,
  height: 2.06,
} as const;

export function chamferedPanel(width: number, height: number, cut: number) {
  const x = width / 2, y = height / 2;
  const shape = new Shape();
  shape.moveTo(-x + cut, -y);
  shape.lineTo(x - cut, -y);
  shape.lineTo(x, -y + cut);
  shape.lineTo(x, y - cut);
  shape.lineTo(x - cut, y);
  shape.lineTo(-x + cut, y);
  shape.lineTo(-x, y - cut);
  shape.lineTo(-x, -y + cut);
  shape.closePath();
  return new ShapeGeometry(shape);
}

export function createFittingRoomMirror(compact: boolean, elapsedSeconds: () => number | undefined) {
  const { width, height, position, yaw } = FITTING_WALL_MIRROR;
  const resolution = compact ? 384 : 640;
  const mirror = new Reflector(chamferedPanel(width, height, .075), {
    color: "#b8bcc3",
    textureWidth: resolution,
    textureHeight: resolution,
    multisample: 0,
  });
  mirror.name = "fitting-room-wall-mirror";
  mirror.position.set(...position);
  mirror.rotation.y = yaw;
  gatePlanarReflectionCapture(mirror, elapsedSeconds, compact ? 1 / 15 : 1 / 24);
  return mirror;
}
