import type {PhysicsEntitySnapshot} from '../store/session/networkStore';
import {ResourceFlags} from '../store/telemetry/resourceMasks';
import {VehicleFlags} from '../store/input/protocol/inputMasks';
import {TelemetryFields} from '../store/session/vehicleConfigStore';
import type {AttackSymbol} from './AttackIcon';

export type EffectNature='mobility'|'offense'|'control'|'heat'|'wear'|'healing'|'defense'|'utility';
export type ActiveVehicleEffect={id:string;label:string;description:string;kind:'buff'|'debuff';nature:EffectNature;icon:AttackSymbol;remaining:number|null;duration:number|null};
const time=(value:unknown,max:number)=>typeof value==='number'&&Number.isFinite(value)?Math.ceil(Math.max(0,Math.min(max,value))*10)/10:0;
/** Primitive signals keep the status component independent of 60 Hz pose changes. */
export function readEffectSignals(entity:PhysicsEntitySnapshot|null|undefined){
 const resource=entity?.resource_mask;
 return {
  protection:time(entity?.health?.spawn_protection_s,2),
  defeated:entity?.health?.defeated===true,
  charge:time(entity?.combat?.ram_charge_remaining,3),
  ram:time(entity?.combat?.ram_remaining,7),
  stun:time(entity?.combat?.stun_remaining,1),
  resource:Number.isSafeInteger(resource)&&resource!>=0&&resource!<=0xffff?resource!:0,
  boost:Boolean((entity?.telemetry_mask??0)&TelemetryFields.BOOST)&&Boolean((entity?.vehicle_mask??0)&VehicleFlags.BOOST),
 };
}
export function activeVehicleEffects(s:ReturnType<typeof readEffectSignals>):ActiveVehicleEffect[]{
 const effects:ActiveVehicleEffect[]=[];if(s.defeated)return effects;
 if(s.protection>0)effects.push({id:"spawn-protection",label:"SPAWN SHIELD",description:"Brief damage protection after spawning. Firing or starting Ram ends it early.",kind:"buff",nature:"defense",icon:"shield",remaining:s.protection,duration:2});
 const recovering=Boolean(s.resource&ResourceFlags.THERMAL_RECOVERY);
 if(s.stun>0)effects.push({id:'stun',label:'STUNNED',description:'Steering, throttle and weapons are briefly interrupted.',kind:'debuff',nature:'control',icon:'stun',remaining:s.stun,duration:1});
 if(recovering)effects.push({id:'thermal-recovery',label:'ENGINE WEAK',description:'Overheating reduced engine output. Ease off to cool or drive to repairs.',kind:'debuff',nature:'heat',icon:'heat',remaining:null,duration:null});
 else if(s.resource&ResourceFlags.HOT)effects.push({id:'engine-hot',label:'ENGINE HOT',description:'Heat is reducing engine power. Reduce load and seek repairs.',kind:'debuff',nature:'heat',icon:'heat',remaining:null,duration:null});
 if(!recovering&&s.stun===0){
  if(s.charge>0)effects.push({id:'ram-charge',label:'RAM CHARGE',description:'Charge speed and impact bonus are active. Enemy contact can stun and knock back.',kind:'buff',nature:'offense',icon:'ram',remaining:s.charge,duration:3});
  else if(s.ram>0)effects.push({id:'ram-boost',label:'RAM BOOST',description:'The reduced speed bonus remains active. Heat, fuel and nitrous costs still apply.',kind:'buff',nature:'mobility',icon:'boost',remaining:Math.min(4,s.ram),duration:4});
  else if(s.boost)effects.push({id:'nitrous',label:'NITROUS',description:'Nitrous is boosting engine output and consuming its reserve.',kind:'buff',nature:'mobility',icon:'boost',remaining:null,duration:null});
 }
 if(s.resource&ResourceFlags.DAMAGED)effects.push({id:'engine-wear',label:'ENGINE WEAR',description:'Vehicle condition is reducing engine power. Visit a mechanic.',kind:'debuff',nature:'wear',icon:'repair',remaining:null,duration:null});
 return effects;
}
