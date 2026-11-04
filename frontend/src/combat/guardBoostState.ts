import type {PhysicsEntitySnapshot} from '../store/session/networkStore';

export const GUARD_DURATION_S=4;
export const GUARD_COOLDOWN_S=20;
export const GUARD_SHIELD_HP=200;
export const GUARD_FUEL_LITERS=3;
export const TANK_BARRIER_DURATION_S=5;
export const TANK_BARRIER_COOLDOWN_S=15;
export const TANK_BARRIER_HP=500;
export const TANK_BARRIER_FUEL_LITERS=1;
export type GuardActionKind='brz_guard'|'tank_barrier';
export type GuardBoostSnapshot={kind?:''|GuardActionKind;remaining_s:number;cooldown_s:number;shield_hp:number;shield_max_hp:number;break_seq:number};
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);

/** Missing/invalid contracts never create a ready button or a permanent shield. */
export function readGuardBoost(entity:PhysicsEntitySnapshot|null|undefined):GuardBoostSnapshot|null{
 const guard=entity?.guard;
 if(!guard||![guard.remaining_s,guard.cooldown_s,guard.shield_hp,guard.shield_max_hp].every(finite)||guard.remaining_s<0||guard.cooldown_s<0||guard.shield_hp<0||guard.shield_max_hp<=0||guard.shield_hp>guard.shield_max_hp||!Number.isSafeInteger(guard.break_seq)||guard.break_seq<0)return null;
 if(guard.kind!==undefined&&!['','brz_guard','tank_barrier'].includes(guard.kind))return null;
 return guard;
}

export function guardActionKind(entity:PhysicsEntitySnapshot|null|undefined,guard=readGuardBoost(entity)):GuardActionKind{
 return guard?.kind==='tank_barrier'||(!guard?.kind&&entity?.vehicle_id==='tank')?'tank_barrier':'brz_guard';
}
