import type {VehicleColliderShape} from '../store/session/networkStore';

export const GUARD_ARC_HALF_ANGLE=Math.PI/3;

/** A shallow shield lives ahead of the +Z bumper. Its full arc clears the hull,
 * rather than disappearing inside the corners of a rectangular chassis. */
export function guardShieldTransform(collider?:Pick<VehicleColliderShape,'chassis_half_extents'|'chassis_offset'>){
 const half=collider?.chassis_half_extents,offset=collider?.chassis_offset;
 const dimension=(value:number|undefined,fallback:number)=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:fallback;
 const origin=(value:number|undefined)=>typeof value==='number'&&Number.isFinite(value)?value:0;
 const halfX=dimension(half?.[0],.9),halfY=dimension(half?.[1],.4),halfZ=dimension(half?.[2],1.9);
 return {x:origin(offset?.[0]),y:origin(offset?.[1]),z:origin(offset?.[2])+halfZ+.05,
  widthRadius:(halfX+.15)/Math.sin(GUARD_ARC_HALF_ANGLE),height:2*halfY+.25,depthRadius:Math.max(.45,Math.min(.7,halfZ*.2))};
}

/** A sequence number confirms a break. First observation and reconnects only
 * establish a baseline, so an old break cannot replay as a fresh explosion. */
export type GuardBreakState={sequence:number|null;at:number};
export const GUARD_BREAK_FLASH_S=.35;
export function sampleGuardBreak(state:GuardBreakState,sequence:number,now:number){
 if(!Number.isSafeInteger(sequence)||sequence<0||!Number.isFinite(now))return 0;
 if(state.sequence!==null&&sequence<state.sequence||now<state.at)state.at=-Infinity;
 if(state.sequence!==null&&sequence>state.sequence)state.at=now;
 state.sequence=sequence;
 return Math.max(0,Math.min(1,1-(now-state.at)/GUARD_BREAK_FLASH_S));
}
