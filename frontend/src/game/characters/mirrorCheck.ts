import { Box3, MathUtils, Vector3, type Object3D } from "three";
import type { GarageStation } from "../preview/garageStations";
import type { Emote } from "./garageEmotes";
export const MIRROR_CHECK_ID = "mirror-lipstick";
export const MIRROR_CHECK_NAME = "Side mirror · lipstick check";
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

export function mirrorCheckPose(fit: MirrorCheckFit): Emote {
 const x = fit.across, z = fit.forward;
 const at = { sway:x, travel:z, turn:fit.turn, rise:-.025,
  feet:{l:[x+.025,0,z+.025,fit.turn-.08],r:[x-.025,0,z-.025,fit.turn+.08]} } as const;
 const glance = { ...at, torso:[.10,0,0],head:[fit.gaze,0,.04],face:[.25,.1] } as const;
 const tube = {offset:[-.035,-.07,.105],atHead:true,angles:[0,0,-.15]} as const;
 return {id:MIRROR_CHECK_ID,name:MIRROR_CHECK_NAME,duration:7.4,prop:"lipstick",keys:[
  [.08,{sway:x*.3,travel:z*.3,turn:fit.turn*.23,feet:{l:[x*.55,.045,z*.55,fit.turn*.38]}}],
  [.17,{sway:x*.7,travel:z*.7,turn:fit.turn*.59,feet:{l:[x,0,z,fit.turn*.80],r:[x*.7,.04,z*.7,fit.turn*.59]}}],
  [.25,glance],
  [.34,{...glance,head:[fit.gaze,.14,.04],prop:{...tube,offset:[-.10,-.18,.15]},fingers:[null,"pinch"]}],
  [.44,{...glance,prop:tube,fingers:[null,"pinch"]}],
  [.55,{...glance,head:[fit.gaze,-.12,-.03],prop:{...tube,offset:[.018,-.07,.105]},fingers:[null,"pinch"]}],
  [.65,{...glance,head:[fit.gaze,.06,.03],prop:{...tube,offset:[-.10,-.19,.14]},fingers:[null,"pinch"],face:[.55,.1]}],
  [.73,glance],
  [.83,{sway:x*.7,travel:z*.7,turn:fit.turn*.53,feet:{l:[x*.55,.045,z*.55,fit.turn*.43],r:[x,0,z,fit.turn*.66]}}],
  [.92,{sway:x*.25,travel:z*.25,turn:fit.turn*.17,feet:{l:[0,0,0,.1],r:[x*.3,.035,z*.3,fit.turn*.23]}}],
 ]};
}
