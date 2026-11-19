import { Box3, Euler, MathUtils, Vector3, type Object3D } from "three";
import type { GarageStation } from "../preview/garageStations";
import type { Emote, XYZ } from "./garageEmotes";
export const MAKEUP_EMOTES = [
  { id: "makeup-check", mirrorId: "mirror-makeup", name: "Check makeup", icon: "makeupCheck" },
  { id: "redo-lipstick", mirrorId: "mirror-lipstick", name: "Redo lipstick", icon: "lipstick" },
  { id: "apply-eyeliner", mirrorId: "mirror-eyeliner", name: "Apply eyeliner", icon: "eyeliner" },
] as const;
export const MIRROR_MAKEUP_EMOTES = MAKEUP_EMOTES.map(({ mirrorId, name }) => ({
  id: mirrorId, name: `Side mirror · ${name}`,
}));
export function isMirrorMakeupEmote(id: string | undefined) {
  return MIRROR_MAKEUP_EMOTES.some(item => item.id === id);
}
export type MirrorCheckFit = { across: number; forward: number; gaze: number; turn: number };

/** Prefer separately authored side mirrors; fused GLBs use the station's window corner. */
export function nearestSideMirror(root: Object3D, station: GarageStation, bounds: Box3, from: Vector3) {
 if (station.kind !== "wheel") return undefined;
 root.updateWorldMatrix(true, true);
 const center = bounds.getCenter(new Vector3()).x;
 const side = Math.sign(from.x - center) || Math.sign(station.seat[0]) || 1;
 const candidates: Vector3[] = [];
 root.traverse(part => {
  if (!/mirror/i.test(part.name) || /rearview|interior|center/i.test(part.name)) return;
  const box = new Box3().setFromObject(part, true), size = box.getSize(new Vector3());
  if (box.isEmpty() || size.x > .7 || size.y > .5 || size.z > .7) return;
  const p = root.worldToLocal(box.getCenter(new Vector3()));
  if (side * (p.x - center) > Math.abs(station.seat[0] - center) + .12) candidates.push(p);
 });
 if (!candidates.length) candidates.push(new Vector3(side < 0 ? bounds.min.x : bounds.max.x, station.rim[1] + .22, station.rim[2] + .12));
 return candidates.sort((a,b) => a.distanceToSquared(from) - b.distanceToSquared(from))[0];
}
export function fitMirrorCheck(from: Vector3, mirror: Vector3, side: number): MirrorCheckFit | undefined {
 const approach = mirror.z - .36 - from.z;
 if (Math.abs(approach) > 1.4) return undefined;
 const across = -side * approach;
 const targetX = -side * (mirror.z - from.z - approach);
 const targetZ = side * (mirror.x - from.x);
 return { across, forward: 0, turn: Math.atan2(targetX, targetZ),
  gaze: MathUtils.clamp(Math.atan2(from.y + 1.48 - mirror.y, Math.hypot(targetX, targetZ)), -.35, .85) };
}

type MakeupMode = typeof MAKEUP_EMOTES[number]["id"];
type Pose = Emote["keys"][number][1];

function applicatorAt(atHead: "lips" | "eyes", tip: XYZ, angles: XYZ, length: number): NonNullable<Pose["prop"]> {
 const offset = new Vector3(...tip).sub(new Vector3(0, length, 0).applyEuler(new Euler(...angles)));
 return { offset: [offset.x, offset.y, offset.z], angles, atHead };
}

function makeupMotion(mode: MakeupMode, glance: Pose, gaze: number): Emote["keys"] {
 const inspect = (yaw: number): Pose => ({ ...glance, head: [gaze + .025, yaw, yaw * -.18], face: [.28, .25] });
 const hold = (tool: NonNullable<Pose["prop"]>, yaw = 0): Pose => ({
  ...inspect(yaw), prop: tool, fingers: [null, "pinch"],
 });
 if (mode === "makeup-check") return [
  [.26, glance], [.37, inspect(.25)], [.52, inspect(-.26)], [.64, inspect(.12)], [.74, glance],
 ];
 if (mode === "redo-lipstick") {
  const lipstick = (tip: XYZ) => applicatorAt("lips", tip, [-.30, 0, -.20], .0225);
  const ready = lipstick([-.11, -.09, .06]);
  return [
   [.26, glance], [.34, hold(ready)],
   [.41, hold(lipstick([-.023, .003, .004]))],
   [.46, hold(lipstick([.023, .003, .004]))],
   [.50, hold(lipstick([.023, -.005, .005]))],
   [.55, hold(lipstick([-.023, -.005, .004]))],
   [.63, hold(ready)], [.68, { ...inspect(.13), face: [.55, .12] }], [.74, glance],
  ];
 }
 const eyeliner = (tip: XYZ, roll: number) => applicatorAt("eyes", tip, [-1.03, 0, roll], .060);
 const ready = eyeliner([-.10, -.10, .088], .26);
 return [
  [.26, glance], [.34, hold(ready, .08)],
  [.40, hold(eyeliner([-.023, .001, .006], .38), .08)],
  [.46, hold(eyeliner([-.045, .004, .004], .50), .08)],
  [.51, hold(eyeliner([-.012, .017, .078], .18))],
  [.56, hold(eyeliner([.020, .001, .006], -.25), -.08)],
  [.62, hold(eyeliner([.045, .004, .004], -.38), -.08)],
  [.69, hold(ready)], [.75, glance],
 ];
}

export function makeupPreviewEmote(id: string, fit?: MirrorCheckFit): Emote | undefined {
 const mode = MAKEUP_EMOTES.find(item => item.id === id || (fit && item.mirrorId === id));
 if (!mode) return undefined;
 const mirror = mode.mirrorId === id ? fit : undefined;
 const x = mirror?.across ?? 0, z = mirror?.forward ?? 0, turn = mirror?.turn ?? 0;
 const gaze = mirror?.gaze ?? 0;
 const at: Pose = mirror ? { sway: x, travel: z, turn, rise: -.025,
  feet: { l: [x + .025, 0, z + .025, turn - .08], r: [x - .025, 0, z - .025, turn + .08] },
 } : {};
 const glance: Pose = { ...at, torso: [mirror ? .08 : .015, 0, 0], head: [gaze, 0, .04], face: [.25, .1] };
 const prop = mode.id === "redo-lipstick" ? "lipstick" : mode.id === "apply-eyeliner" ? "eyeliner" : undefined;
 const motion = makeupMotion(mode.id, glance, gaze);
 const keys: Emote["keys"] = mirror ? [
  [.08, { sway: x * .3, travel: z * .3, turn: turn * .23, feet: { l: [x * .55, .045, z * .55, turn * .38] } }],
  [.17, { sway: x * .7, travel: z * .7, turn: turn * .59, feet: { l: [x, 0, z, turn * .80], r: [x * .7, .04, z * .7, turn * .59] } }],
  ...motion,
  [.83, { sway: x * .7, travel: z * .7, turn: turn * .53, feet: { l: [x * .55, .045, z * .55, turn * .43], r: [x, 0, z, turn * .66] } }],
  [.92, { sway: x * .25, travel: z * .25, turn: turn * .17, feet: { l: [0, 0, 0, .1], r: [x * .3, .035, z * .3, turn * .23] } }],
 ] : motion.map(([time, pose]) => [(time - .20) / .66, pose]);
 return { id, name: mirror ? `Side mirror · ${mode.name}` : mode.name, duration: mirror ? 7.4 : 5.2, prop, keys };
}
