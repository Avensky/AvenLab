import type {PhysicsEntitySnapshot} from '../store/session/networkStore';
import {ResourceFlags} from '../store/telemetry/resourceMasks';
import {VehicleFlags} from '../store/input/protocol/inputMasks';
import {TelemetryFields} from '../store/session/vehicleConfigStore';
import type {AttackSymbol} from './AttackIcon';
import {readGuardBoost,guardActionKind,GUARD_DURATION_S,DIVE_DURATION_S} from './guardBoostState';

export type EffectNature='mobility'|'offense'|'control'|'heat'|'wear'|'healing'|'defense'|'utility';
export type ActiveVehicleEffect={id:string;label:string;description:string;kind:'buff'|'debuff';nature:EffectNature;icon:AttackSymbol;remaining:number|null;duration:number|null};
const time=(value:unknown,max:number)=>typeof value==='number'&&Number.isFinite(value)?Math.ceil(Math.max(0,Math.min(max,value))*10)/10:0;
/** Primitive signals keep the status component independent of 60 Hz pose changes. */
export function readEffectSignals(entity:PhysicsEntitySnapshot|null|undefined,boostHeld=false,deckHold=false){
 const resource=entity?.resource_mask;
 const guard=readGuardBoost(entity);
 const guardKind=guardActionKind(entity,guard);
 return {
  protection:time(entity?.health?.spawn_protection_s,2),
  defeated:entity?.health?.defeated===true,
  charge:time(entity?.combat?.ram_charge_remaining,3),
  ram:time(entity?.combat?.ram_remaining,7),
  stun:time(entity?.combat?.stun_remaining,1),
  resource:Number.isSafeInteger(resource)&&resource!>=0&&resource!<=0xffff?resource! & (ResourceFlags.THERMAL_RECOVERY|ResourceFlags.HOT|ResourceFlags.DAMAGED|ResourceFlags.BLINK_STRESS):0,
  boost:Boolean((entity?.telemetry_mask??0)&TelemetryFields.BOOST)&&Boolean((entity?.vehicle_mask??0)&VehicleFlags.BOOST),
  dryBoost:Boolean(entity?.vehicle_id!=='tank' && boostHeld && entity?.boost_fraction===0),
  deckHold,
  dive:time(guard?.dive_remaining_s,DIVE_DURATION_S),
  guard:time(guard?.remaining_s,GUARD_DURATION_S),
  guardHp:guard?Math.ceil(guard.shield_hp):0,
  guardKind,
 };
}
export function activeVehicleEffects(s:ReturnType<typeof readEffectSignals>):ActiveVehicleEffect[]{
 const effects:ActiveVehicleEffect[]=[];if(s.defeated)return effects;
 if(s.protection>0)effects.push({id:"spawn-protection",label:"SPAWN SHIELD",description:"Brief damage protection after spawning. Firing or starting Ram ends it early.",kind:"buff",nature:"defense",icon:"shield",remaining:s.protection,duration:2});
 if(s.deckHold)effects.push({id:'deck-hold',label:'DECK AUTO BRAKE',description:'The rescue vessel reduces your relative horizontal slide while you are on its landing deck.',kind:'buff',nature:'control',icon:'shield',remaining:null,duration:null});
 if(s.dive>0)effects.push({id:'dive-shield',label:'DIVE SHIELD',description:'All-angle damage protection. Your gun remains available.',kind:'buff',nature:'defense',icon:'shield',remaining:s.dive,duration:DIVE_DURATION_S});
 if(s.guard>0 || (s.guardKind==='tank_barrier' && s.guardHp>0)){
  const tank=s.guardKind==='tank_barrier';
  if(s.guardHp>0)effects.push({id:tank?'tank-barrier':'front-guard',label:tank?'FRONTAL BARRIER':'FRONT SHIELD',description:tank?`${s.guardHp} barrier HP. Rotate the cannon to cover teammates until the barrier breaks.`:`${s.guardHp} shield HP on your front. Side and rear hits bypass the guard.`,kind:'buff',nature:'defense',icon:'shield',remaining:tank?null:s.guard,duration:tank?null:GUARD_DURATION_S});
  if(!tank)effects.push({id:'guard-stability',label:'STABILIZED BOOST',description:'Grounded stabilization helps high-speed steering and controlled handbrake drifts. A fast frontal rush can add 60 HP once per enemy. Stability remains after the shield breaks; fuel and nitrous were spent on activation.',kind:'buff',nature:'mobility',icon:'boost',remaining:s.guard,duration:GUARD_DURATION_S});
 }
 if(s.resource & ResourceFlags.BLINK_STRESS) effects.push({id:'blink-stress',label:'BLINK STRAIN',description:'Field drive strain: 1.6× engine fuel burn and 1.5× temperature rise for six seconds after blinking.',kind:'debuff',nature:'heat',icon:'heat',remaining:null,duration:null});
 const recovering=Boolean(s.resource&ResourceFlags.THERMAL_RECOVERY);
 if(s.stun>0)effects.push({id:'stun',label:'STUNNED',description:'Steering, throttle and weapons are briefly interrupted.',kind:'debuff',nature:'control',icon:'stun',remaining:s.stun,duration:1});
 if(recovering)effects.push({id:'thermal-recovery',label:'ENGINE WEAK',description:'Overheating reduced engine output. Ease off to cool or drive to repairs.',kind:'debuff',nature:'heat',icon:'heat',remaining:null,duration:null});
 else if(s.resource&ResourceFlags.HOT)effects.push({id:'engine-hot',label:'ENGINE HOT',description:'Heat is reducing engine power. Reduce load and seek repairs.',kind:'debuff',nature:'heat',icon:'heat',remaining:null,duration:null});
 if(!recovering&&s.stun===0){
  if(s.charge>0)effects.push({id:'ram-charge',label:'RAM CHARGE',description:'Charge speed and impact bonus are active. Enemy contact can stun and knock back.',kind:'buff',nature:'offense',icon:'ram',remaining:s.charge,duration:3});
  else if(s.ram>0)effects.push({id:'ram-boost',label:'RAM BOOST',description:'The reduced speed bonus remains active. Heat, fuel and nitrous costs still apply.',kind:'buff',nature:'mobility',icon:'boost',remaining:Math.min(4,s.ram),duration:4});
  else if(s.boost&&s.guard===0)effects.push({id:'nitrous',label:'NITROUS',description:'Nitrous adds up to 35% engine output and 12% top speed. Grounded tires gain drive grip and roll damping while the reserve lasts.',kind:'buff',nature:'mobility',icon:'boost',remaining:null,duration:null});
 }
 if(s.dryBoost)effects.push({id:'nitrous-empty',label:'NITROUS EMPTY',description:'Nitrous reserve is depleted. Recharge at a service station before boosting again.',kind:'debuff',nature:'wear',icon:'boost',remaining:null,duration:null});
 if(s.resource&ResourceFlags.DAMAGED)effects.push({id:'engine-wear',label:'ENGINE WEAR',description:'Vehicle condition is reducing engine power. Visit a mechanic.',kind:'debuff',nature:'wear',icon:'repair',remaining:null,duration:null});
 return effects;
}
