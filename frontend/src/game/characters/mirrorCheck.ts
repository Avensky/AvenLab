import { Box3, Vector3, type Object3D } from "three";
import type { GarageStation } from "../preview/garageStations";
import type { Emote } from "./garageEmotes";
export const MIRROR_CHECK_ID = "mirror-lipstick";
export const MIRROR_CHECK_NAME = "Side mirror · lipstick check";
export type MirrorCheckFit = { across: number; forward: number; gaze: number; side: number };

/** Prefer separately authored side mirrors; fused GLBs use the station's window corner. */
export function nearestSideMirror(root: Object3D, station: GarageStation, bounds: Box3, from: Vector3) {
 if (station.kind !== "wheel") return undefined;
 root.updateWorldMatrix(true, true);
 const candidates: Vector3[] = [];
 root.traverse(part => {
  if (!/mirror/i.test(part.name) || /rearview|interior|center/i.test(part.name)) return;
  const box = new Box3().setFromObject(part, true), size = box.getSize(new Vector3());
  if (box.isEmpty() || size.x > .7 || size.y > .5 || size.z > .7) return;
  const p = root.worldToLocal(box.getCenter(new Vector3()));
  if (Math.abs(p.x) > Math.abs(station.rim[0]) + .12) candidates.push(p);
 });
 if (!candidates.length) for (const side of [-1, 1]) candidates.push(new Vector3(side < 0 ? bounds.min.x : bounds.max.x, station.rim[1] + .22, station.rim[2] + .12));
 return candidates.sort((a,b) => a.distanceToSquared(from) - b.distanceToSquared(from))[0];
}
export function mirrorCheckPose(fit: MirrorCheckFit): Emote {
 const x = fit.across, z = fit.forward;
 const at = { sway:x, travel:z, turn:Math.PI, rise:-.025,
  feet:{l:[x+.025,0,z+.025,Math.PI-.08],r:[x-.025,0,z-.025,Math.PI+.08]} } as const;
 const glance = { ...at, torso:[.10,0,0],head:[fit.gaze,0,.04],face:[.25,.1] } as const;
 const tube = {offset:[-.035,-.07,.105],atHead:true,angles:[0,0,-.15]} as const;
 return {id:MIRROR_CHECK_ID,name:MIRROR_CHECK_NAME,duration:7.4,prop:"lipstick",keys:[
  [.08,{sway:x*.3,travel:z*.3,turn:.7,feet:{l:[x*.55,.045,z*.55,1.2]}}],
  [.17,{sway:x*.7,travel:z*.7,turn:1.8,feet:{l:[x,0,z,2.4],r:[x*.7,.04,z*.7,1.8]}}],
  [.25,glance],
  [.34,{...glance,head:[fit.gaze,.14,.04],prop:{...tube,offset:[-.10,-.18,.15]},fingers:[null,"pinch"]}],
  [.44,{...glance,prop:tube,fingers:[null,"pinch"]}],
  [.55,{...glance,head:[fit.gaze,-.12,-.03],prop:{...tube,offset:[.018,-.07,.105]},fingers:[null,"pinch"]}],
  [.65,{...glance,head:[fit.gaze,.06,.03],prop:{...tube,offset:[-.10,-.19,.14]},fingers:[null,"pinch"],face:[.55,.1]}],
  [.73,glance],
  [.83,{sway:x*.7,travel:z*.7,turn:1.6,feet:{l:[x*.55,.045,z*.55,1.3],r:[x,0,z,2]}}],
  [.92,{sway:x*.25,travel:z*.25,turn:.5,feet:{l:[0,0,0,.1],r:[x*.3,.035,z*.3,.7]}}],
 ]};
}
