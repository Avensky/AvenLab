import type {PhysicsEntitySnapshot} from '../store/session/networkStore';
import {VehicleFlags} from '../store/input/protocol/inputMasks.ts';
import {ResourceFlags} from '../store/telemetry/resourceMasks.ts';
import type {NoticeTone,NoticeChannel} from './noticeModel';

const warnings:[number,string][]=[
  [ResourceFlags.LOW_FUEL,'Low fuel'],[ResourceFlags.STARVED,'Fuel empty'],
  [ResourceFlags.HOT,'Engine hot'],[ResourceFlags.THERMAL_RECOVERY,'Engine cooling'],
  [ResourceFlags.DAMAGED,'Engine damaged'],[ResourceFlags.BLINK_STRESS,'Blink strain'],
];
export type NoticeIntent={text:string;tone:NoticeTone;channel?:NoticeChannel};
export function vehicleNoticeSignals(me:PhysicsEntitySnapshot,boostHeld:boolean,onDeck:boolean){
  const roadNos=me.vehicle_id!=='tank'&&!me.guard?.remaining_s&&!me.combat?.ram_remaining;
  return {
    flags:me.resource_mask??0,stunned:(me.combat?.stun_remaining??0)>0,
    blocked:me.combat?.ram_blocked??'',boosting:roadNos&&Boolean(me.vehicle_mask&VehicleFlags.BOOST),
    dry:roadNos&&me.boost_fraction===0&&boostHeld,onDeck,
    defeated:me.health?.defeated===true,protected:(me.health?.spawn_protection_s??0)>0,
    cause:me.health?.last_damage_kind??'',disabledReason:me.health?.disabled_reason??'',damage:me.health?.stats?.damage_dealt,
  };
}
export function vehicleNoticeTransitions(previous:ReturnType<typeof vehicleNoticeSignals>|undefined,current:ReturnType<typeof vehicleNoticeSignals>,announceInitialProtection=false):NoticeIntent[]{
  // Reconnecting/resuming establishes a baseline, never a replay of old combat.
  // A truly new live spawn may announce its shield once on initial admission.
  if(!previous)return announceInitialProtection&&current.protected&&!current.defeated?[{text:'SPAWN PROTECTION ACTIVE',tone:'buff',channel:'system'}]:[];
  const notices:NoticeIntent[]=[];
  for(const [bit,text] of warnings)if((current.flags&~previous.flags)&bit)notices.push({text,tone:'warning'});
  if(current.stunned&&!previous.stunned)notices.push({text:'STUNNED · CONTROLS INTERRUPTED',tone:'debuff'});
  if(current.blocked&&current.blocked!==previous.blocked)notices.push({text:current.blocked,tone:'warning'});
  if(current.boosting&&!previous.boosting)notices.push({text:'NITROUS · SPEED + STABILITY',tone:'buff'});
  if(current.dry&&!previous.dry)notices.push({text:'NITROUS EMPTY · BOOST UNAVAILABLE',tone:'debuff'});
  if(current.onDeck&&!previous.onDeck)notices.push({text:'RESCUE DECK · AUTO BRAKE ENGAGED',tone:'buff',channel:'rescue'});
  if(current.defeated&&!previous.defeated)notices.push({
    text:current.cause==='water'?'VEHICLE LOST IN WATER':current.cause==='out_of_bounds'?'OUT OF BOUNDS':current.disabledReason==='fuel'?'FUEL EMPTY · VEHICLE DISABLED':'VEHICLE DISABLED',tone:'debuff',channel:'system',
  });
  if(!current.defeated&&previous.defeated)notices.push({
    text:current.protected?'VEHICLE READY · SPAWN PROTECTION ACTIVE':'VEHICLE READY',tone:'buff',channel:'system',
  });
  else if(current.protected&&!previous.protected&&!current.defeated)notices.push({text:'SPAWN PROTECTION ACTIVE',tone:'buff',channel:'system'});
  return notices;
}
