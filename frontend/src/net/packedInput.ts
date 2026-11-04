import type {InputPacket} from '../store/input/inputStore';
import type {TankWeapon,WeaponMount} from '../combat/combatStore';

type CombatInput = WeaponMount & {
  enabled:boolean;fire:boolean;ram:boolean;hull_locked:boolean;
  weapon:TankWeapon;yaw:number;pitch:number;lock_target?:[number,number];
};
const weapons = {cannon:0,coax:1,basket:2};
const roles = {assault:0,support:1,medic:2};

/** AI v1. One self-contained little-endian sample. Presence bits preserve
 * absent commands vs a command to clear a mask or release the parking brake. */
export function encodePackedInput(input:InputPacket & {combat?:CombatInput}):ArrayBuffer {
  const c=input.combat;
  const size=32+(input.cockpit_mask!==undefined?4:0)+(input.parking_brake!==undefined?4:0)+
    (input.cabin_mask!==undefined?4:0)+(input.debug_mask!==undefined?4:0)+(c?22:0)+(c?.lock_target?8:0);
  const buffer=new ArrayBuffer(size),view=new DataView(buffer);
  view.setUint16(0,0x4149);view.setUint8(2,1);
  view.setUint8(3,Number(input.cockpit_mask!==undefined) | Number(input.parking_brake!==undefined)<<1 |
    Number(input.cabin_mask!==undefined)<<2 | Number(input.debug_mask!==undefined)<<3 | Number(!!c)<<4);
  view.setUint32(4,input.seq,true);
  let offset=8;
  const float=(v:number)=>{view.setFloat32(offset,v,true);offset+=4;};
  const mask=(v:number)=>{view.setUint32(offset,v,true);offset+=4;};
  float(input.dt);float(input.throttle);float(input.steer);float(input.brake);float(input.handbrake);
  view.setUint16(28,input.vehicleMask,true);view.setUint16(30,input.playerMask,true);offset=32;
  if(input.cockpit_mask!==undefined)mask(input.cockpit_mask);
  if(input.parking_brake!==undefined)float(input.parking_brake);
  if(input.cabin_mask!==undefined)mask(input.cabin_mask);
  if(input.debug_mask!==undefined)mask(input.debug_mask);
  if(c){
    view.setUint8(offset++,Number(c.enabled)|Number(c.fire)<<1|Number(c.ram)<<2|Number(c.hull_locked)<<3|Number(!!c.lock_target)<<4);
    view.setUint8(offset++,weapons[c.weapon]|roles[c.role]<<2);
    float(c.yaw);float(c.pitch);float(c.x);float(c.y);float(c.z);
    if(c.lock_target){float(c.lock_target[0]);float(c.lock_target[1]);}
  }
  return buffer;
}
