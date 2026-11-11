import { DataTexture, LinearFilter, LinearMipmapLinearFilter, MathUtils } from 'three';
import type {VehicleColliderShape} from '../store/session/networkStore';

export const GUARD_ARC_HALF_ANGLE=Math.PI/3;

// Reuse the dressing mirror's clear face, illuminated side edges and lower
// tint as one shared map. A tank panel needs no reflection or refraction pass.
function createTankBarrierGlass() {
 const size=64, pixels=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=(x+.5)/size, v=(y+.5)/size;
  const side=Math.min(u,1-u), edge=Math.min(side,v,1-v);
  const bevel=1-MathUtils.smoothstep(edge,.004,.029);
  const rail=(1-MathUtils.smoothstep(side,.014,.058))*
   MathUtils.smoothstep(v,.10,.24)*(1-MathUtils.smoothstep(v,.77,.92));
  const shine=1-MathUtils.smoothstep(Math.abs(u+v*.38-.76),.013,.083);
  const alpha=Math.min(1,.19+bevel*.50+rail*.28+(1-v)**4*.23+shine*.14);
  const index=(y*size+x)*4;
  pixels[index]=pixels[index+1]=pixels[index+2]=255;
  pixels[index+3]=Math.round(alpha*255);
 }
 const texture=new DataTexture(pixels,size,size);
 texture.name='tank-barrier-glass';
 texture.generateMipmaps=true;
 texture.minFilter=LinearMipmapLinearFilter;
 texture.magFilter=LinearFilter;
 texture.needsUpdate=true;
 return texture;
}

export const TANK_BARRIER_GLASS=createTankBarrierGlass();

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
