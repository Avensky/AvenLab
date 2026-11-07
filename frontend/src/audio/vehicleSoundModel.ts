import type {PhysicsEntitySnapshot} from '../store/session/networkStore';
import {VehicleFlags} from '../store/input/protocol/inputMasks.ts';
import {vehicleAudioProfile,hasVehicleAudioProfile,type AudioProfile} from './audioProfiles.ts';

export type AudioPoint = readonly [number,number,number];
export type LocalAudioInput = {throttle:number;brake:number};
export type PreviousSoundPose = {position:AudioPoint;time:number;respawns:number};
export type VehicleSoundState = {
  id:string; profile:AudioProfile; position:AudioPoint; running:boolean; rpm:number;
  speed:number; load:number; slip:number; rolling:number; boost:boolean; gear:number; respawns:number;
};
export const finiteUnit = (n:unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0,Math.min(1,n)) : 0;
const finite = (n:unknown,fallback=0) => typeof n === 'number' && Number.isFinite(n) ? n : fallback;
const validPoint = (value:unknown): value is AudioPoint => Array.isArray(value) && value.length===3 && value.every(Number.isFinite);

/** Fixed-size nearest selection; no full-fleet sort and no unbounded voice pool. */
export function selectAudibleVehicles(entities:readonly PhysicsEntitySnapshot[],listener:AudioPoint,localId:string|null,limit:number,retained:ReadonlySet<string>=new Set()) {
  const count=Math.max(1,Math.min(6,Math.floor(finite(limit,4))));
  const nearest:{entity:PhysicsEntitySnapshot;distance:number;priority:number}[]=[];
  if(!validPoint(listener))return nearest;
  for(const entity of entities){
    if(!hasVehicleAudioProfile(entity.vehicle_id) || !validPoint(entity.position) || entity.health?.defeated)continue;
    const running=(finite(entity.vehicle_mask)&VehicleFlags.ENGINE_ON)!==0;
    const rolling=Math.abs(finite(entity.speed))>.32 &&
      (vehicleAudioProfile(entity.vehicle_id).marine||(entity.wheels??[]).some(wheel=>wheel.grounded===true));
    // Silent parked cars cannot occupy slots ahead of audible vehicles.
    if(!running&&!rolling)continue;
    const distance=Math.hypot(entity.position[0]-listener[0],entity.position[1]-listener[1],entity.position[2]-listener[2]);
    if(distance>220 && entity.id!==localId)continue;
    const priority=entity.id===localId ? -1 : distance*(retained.has(entity.id) ? .85 : 1);
    let index=nearest.findIndex(item=>priority<item.priority);
    if(index<0)index=nearest.length;
    if(index>=count)continue;
    nearest.splice(index,0,{entity,distance,priority});
    if(nearest.length>count)nearest.pop();
  }
  return nearest;
}

export function projectVehicleSound(entity:PhysicsEntitySnapshot,input?:LocalAudioInput,previous?:PreviousSoundPose,time=0):VehicleSoundState {
  const profile=vehicleAudioProfile(entity.vehicle_id);
  const running=!entity.health?.defeated && (finite(entity.vehicle_mask) & VehicleFlags.ENGINE_ON)!==0;
  const speed=Math.min(140,Math.abs(finite(entity.speed)));
  const rpm=running ? Math.max(300,Math.min(15000,finite(entity.rpm,profile.baseRpm*.5))) : 0;
  const load=running ? input ? finiteUnit(Math.abs(input.throttle)) :
    finiteUnit(Math.abs(finite(entity.engine_torque))/(profile.marine?12000:profile.tracks?1800:550)) : 0;
  const respawns=finite(entity.health?.stats?.respawns);
  let slip=0,grounded=false;
  // Only actual grounded wheels create tire noise. The current server exports
  // wheel_speed in radians/sec, generally assigned v_long/radius for visuals;
  // it is NOT a wheel-inertia/traction model. This is a conservative sound cue.
  const radius=entity.collider?.wheel_radius;
  for(const wheel of entity.wheels??[]){
    if(wheel.grounded!==true)continue;
    grounded=true;
    if(typeof radius==='number' && radius>0 && Number.isFinite(radius) &&
      typeof wheel.wheel_speed==='number' && Number.isFinite(wheel.wheel_speed)){
      const surface=Math.abs(wheel.wheel_speed)*radius;
      const mismatch=Math.abs(surface-speed)/Math.max(5,speed);
      if(Math.max(surface,speed)>2)slip=Math.max(slip,finiteUnit((mismatch-.16)*1.6));
    }
  }
  const dt=previous ? time-previous.time : 0;
  if(grounded&&previous&&previous.respawns===respawns&&dt>.01&&dt<.3&&speed>3&&entity.rotation.length===4&&entity.rotation.every(Number.isFinite)){
    const dx=entity.position[0]-previous.position[0],dz=entity.position[2]-previous.position[2];
    // Respawns/teleports must never turn into a full-volume skid burst.
    if(Math.hypot(dx,dz)<Math.max(4,speed*dt*2+.5)){
      const [x,y,z,w]=entity.rotation;
      const yaw=Math.atan2(2*(w*y+x*z),1-2*(y*y+z*z));
      const lateral=Math.abs((Math.cos(yaw)*dx-Math.sin(yaw)*dz)/dt);
      slip=Math.max(slip,finiteUnit((lateral/Math.max(4,speed)-.12)*2.2));
    }
  }
  return {id:entity.id,profile,position:entity.position,running,rpm,speed,load,
    slip:profile.tracks||profile.marine ? 0 : grounded?slip:0,
    rolling:grounded || profile.marine ? finiteUnit(speed/32):0,
    boost:running&&(finite(entity.vehicle_mask)&VehicleFlags.BOOST)!==0,
    gear:finite(entity.gear),respawns};
}

/** Audio ticks and packet receipts are independent clocks. Reusing a snapshot
 * must preserve its drift estimate instead of dividing by receipt-to-now jitter.
 * Local throttle can still modulate the engine between snapshot deliveries. */
export function createVehicleSoundProjector(){
  const history=new Map<string,{pose:PreviousSoundPose;slip:number}>();
  return {
    project(entity:PhysicsEntitySnapshot,receivedSeconds:number,input?:LocalAudioInput):VehicleSoundState {
      const old=history.get(entity.id);
      const same=old?.pose.time===receivedSeconds && old.pose.respawns===finite(entity.health?.stats?.respawns);
      const state=projectVehicleSound(entity,input,same?undefined:old?.pose,receivedSeconds);
      if(same&&!entity.health?.defeated)state.slip=old.slip;
      history.set(entity.id,{pose:{position:[...entity.position] as AudioPoint,time:receivedSeconds,respawns:state.respawns},slip:state.slip});
      return state;
    },
    retain(ids:ReadonlySet<string>){for(const id of history.keys())if(!ids.has(id))history.delete(id);},
    clear(){history.clear();},
  };
}
