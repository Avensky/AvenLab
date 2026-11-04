import {TANK_SECONDARIES} from '../../combat/tankLoadout';
import {HEROES} from '../../store/alpha/alphaStore';
import {ResourceFlags} from '../../store/telemetry/resourceMasks';
import {activeVehicleEffects,readEffectSignals} from '../../combat/activeEffects';
import type {AttackSymbol} from '../../combat/AttackIcon';

export type HeroAbility={
 id:string;
 name:string;
 icon:AttackSymbol;
 state:'live'|'planned';
 description:string;
 stats:{label:string;value:string}[];
 notes?:string;
};
export type HeroAbilityGuide={
 hero:string;
 role:string;
 hp:number;
 description:string;
 weapons:HeroAbility[];
 abilities:[HeroAbility,HeroAbility,HeroAbility];
 ultimate:HeroAbility;
};
const planned=(id:string,name:string,description:string,icon:AttackSymbol='repair'):HeroAbility=>({id,name,icon,state:'planned',description,stats:[],notes:'PLANNED · unavailable in the current build.'});
const tank:HeroAbilityGuide={
 hero:'tank',role:'TANK',hp:1200,
 description:'Control a heavy tracked vehicle. Protect your front with a breakable personal barrier, aim independently of the hull, and use Ram to break close-range pressure. Repair and refuel between fights.',
 weapons:[
  {id:'cannon',name:'CANNON · PRIMARY',icon:'cannon',state:'live',description:'Your fixed primary weapon. A ballistic cannon shot damages the first target hit and kicks the tank backward.',stats:[{label:'Direct hit',value:'250 HP'},{label:'Reload',value:'3 seconds'},{label:'Controller',value:'RB · primary fire'}],notes:'The server resolves the hit. Scope research can show the arc, distance and gravity equation. Vehicle splash damage and armor penetration are pending.'},
  ...TANK_SECONDARIES.map((secondary):HeroAbility=>({
   id:secondary.id,name:`${secondary.label} · SECONDARY`,icon:'coax',state:secondary.planned?'planned':'live',
   description:secondary.id==='roof-mg'?'Rapid fire from the roof-mounted machine gun. Its longer range can reach distant targets.':'Rapid fire from the forward coaxial machine gun. This smaller arm follows turret aim and has a shorter range than the roof gun.',
   stats:secondary.planned?[]:[{label:'Per hit',value:'8 HP'},{label:'Shot interval',value:'0.1 seconds'},{label:'Range',value:`${secondary.rangeMeters} m`},{label:'Controller',value:'D-pad Right · secondary fire'}],
   notes:secondary.planned?'PLANNED · This secondary mount cannot fire yet.':'Y or the weapon-cycle bindings swap only the smaller arms. Your cannon stays primary; primary and secondary fire use separate reloads.',
  })),
 ],
 abilities:[
  {id:'ram',name:'RAM',icon:'ram',state:'live',description:'Launch forward into a three-second charge. Enemy contact adds damage, a brief stun and knockback. A reduced speed bonus then remains for four seconds.',stats:[{label:'Charge / tail',value:'3 s / 4 s'},{label:'Cooldown',value:'60 seconds'},{label:'Enemy bonus',value:'150 HP + 1 s stun'},{label:'Fuel / wear',value:'10 L / 4% condition'}],notes:'Requires the engine running, enough fuel and 7 seconds of NOS reserve, grounded tracks, a forward gear and released brakes. NOS drains while active; engine heat still rises. Braking cancels the rush without refunding cooldown or costs. A full use consumes up to 7 seconds of NOS; engine wear and a bounded heat cost follow.'},
  {id:'barrier',name:'FRONTAL BARRIER',icon:'shield',state:'live',description:'Raise a blue personal shield that follows the front of the tank hull. Its finite pool absorbs frontal damage until it breaks or expires.',stats:[{label:'Shield pool',value:'500 HP · ±60° front'},{label:'Duration / cooldown',value:'5 s / 15 s'},{label:'Fuel cost',value:'1 L · engine running'},{label:'Controller',value:'D-pad Left · barrier'},{label:'Default keyboard',value:'P · remappable'}],notes:'This shield protects your own front; it is not a separate wall that intercepts shots for allies. Sides and rear remain exposed. Engine shutdown, defeat or expiry cancels the barrier while its cooldown continues. It adds no boost, stability or NOS cost.'},
  {id:'scope',name:'SCOPE',icon:'scope',state:'live',description:'Enter the long-range aiming view. The scope temporarily frees turret aim and restores your previous angle-lock choice when you leave.',stats:[{label:'Controller',value:'D-pad Down'},{label:'Resource cost',value:'None'},{label:'Angle lock',value:'R3 · full ring = locked'},{label:'Reset forward',value:'D-pad Up · 1 s cooldown'}],notes:'The research panel explains trajectory, range and gravity. Angle Lock holds bearing/elevation relative to the hull; Reset returns the turret forward and restores the previous lock choice. These are aim controls, not a hull brake. Scope always uses free aim.'},
 ],
 ultimate:planned('ultimate','ULTIMATE','Charge builds slowly while alive (about eight minutes from passive charge alone), with extra charge from actual enemy damage and teammate healing. The tank ultimate action is still being designed.','boost'),
};

/** Describes shipped behavior, not future role promises. Every hero has three
 * ability slots and one ultimate slot; unfinished actions stay visibly planned. */
export function getHeroAbilityGuide(hero:string):HeroAbilityGuide{
 if(hero==='tank')return tank;
 const definition=HEROES.find(item=>item.id===hero)??HEROES.find(item=>item.id==='brz')!;
 const support=definition.role==='support',mechanic=definition.id==='mechanic',guardDps=definition.id==='brz';
 const primary:HeroAbility=mechanic?{
  id:'health-pack',name:'ASSISTED HEALTH PACK',icon:'repair',state:'live',
  description:'Primary fire sends a health pack to the nearest injured living teammate with a clear path. Target assist handles the shot; manual aiming is not required.',
  stats:[{label:'Healing',value:'75 HP per pack'},{label:'Assist range',value:'30 m · line of sight'},{label:'Cooldown',value:'1.25 seconds'},{label:'Fuel cost',value:'0.25 L per pack'},{label:'Controller',value:'RB · primary fire'}],
  notes:'The server chooses and validates the teammate. Packs travel to the target and restore only missing HP; actual healing contributes to your ultimate meter. Use Mechanic Recovery for disabled teammates. Health packs do not refuel or revive.',
 }:{id:'factory-gun',name:'FACTORY GUN · COMBAT TEST',icon:'coax',state:'live',description:'One server-owned roof-center gun fires at the first target hit. Additional hero-specific weapon kits remain planned.',stats:[{label:'Per hit',value:'8 HP'},{label:'Range',value:'200 m'}],notes:'The assault/support test fires every 0.1 s. This primary weapon deals damage; future support and precision weapon kits remain separately planned.'};
 const firstAbility:HeroAbility=mechanic?{id:'revive',name:'MECHANIC RECOVERY',icon:'repair',state:'live',description:'Recover a nearby disabled teammate in place before their recovery timer expires. It can also recover a fuel-empty teammate.',stats:[{label:'Range',value:'8 m · stop near ally'},{label:'Cooldown',value:'20 seconds'},{label:'Combat recovery',value:'30% hull HP · at least 10% fuel'},{label:'Controller',value:'LB · recovery'}],notes:'Requires a living Mechanic, an ally within the live recovery window and safe placement. Combat revivals count as resurrections; fuel-only recovery refills actual fuel without inventing a kill or death.'}:guardDps?{
  id:'guard-boost',name:'GUARD BOOST',icon:'shield',state:'live',
  description:'Deploy a finite frontal shield and a short stabilizing boost. Keep the shield facing an opponent when approaching a heavy vehicle; the stability buff helps high-speed control and handbrake drift.',
  stats:[{label:'Duration / cooldown',value:'4 s / 20 s'},{label:'Front shield',value:'200 HP · ±60°'},{label:'Front rush hit',value:'60 HP · once per opponent'},{label:'Costs',value:'4 s NOS + 3 L fuel'},{label:'Speed / drive force',value:'+25% / +35%'},{label:'Controller',value:'LB · Shift on keyboard'}],
  notes:'BRZ DPS only; the Mechanic shares the chassis but has its own support kit. A grounded frontal collision above 6 m/s closing speed can add one rush hit per opponent. The shield can break before stability ends; side and rear impacts remain dangerous. Unlike tank Ram, this does not stun or add forced knockback.',
 }:planned('ability-one',support?'TEAM SUPPORT':'VEHICLE ABILITY','This hero-specific action is not implemented.');
 return {
  hero:definition.id,role:definition.role.toUpperCase(),hp:500,
  description:mechanic?'Heal living teammates with target-assisted health packs and recover disabled allies before their recovery window expires.':guardDps?'An agile single-weapon attack vehicle with a breakable frontal shield and a stabilizing boost. Approach heavy vehicles with the shield facing forward, then use controlled drift to reposition.':support?'A support hero on the existing road-vehicle chassis. Dedicated ally repair, refueling and support abilities are pending. The current generic weapon test remains available.':'A road vehicle with arcade driving and the shared combat test. Unique weapons and dedicated abilities are still being developed.',
  weapons:[primary],
  abilities:[firstAbility,planned('ability-two','MOBILITY ABILITY','The second dedicated ability for this hero is pending.','boost'),planned('ability-three','UTILITY ABILITY','The third hero-specific action is pending.','scope')],
  ultimate:planned('ultimate','ULTIMATE','Charge builds slowly while alive (about eight minutes from passive charge alone), with extra charge from actual enemy damage and teammate healing. A unique ultimate action is not implemented for this hero.','boost'),
 };
}

// Reuse the live HUD's descriptions and durations so help cannot disagree with
// the effects currently shown in battle. These are examples, not live buffs.
const empty=readEffectSignals(null);
export const HERO_EFFECT_GUIDE=[
 ...activeVehicleEffects({...empty,guard:4,guardHp:200}),
 ...activeVehicleEffects({...empty,guard:5,guardHp:500,guardKind:'tank_barrier'}),
 ...activeVehicleEffects({...empty,protection:2}),
 ...activeVehicleEffects({...empty,charge:3,ram:7}),
 ...activeVehicleEffects({...empty,ram:4}),
 ...activeVehicleEffects({...empty,boost:true}),
 ...activeVehicleEffects({...empty,stun:1}),
 ...activeVehicleEffects({...empty,resource:ResourceFlags.HOT}),
 ...activeVehicleEffects({...empty,resource:ResourceFlags.THERMAL_RECOVERY}),
 ...activeVehicleEffects({...empty,resource:ResourceFlags.DAMAGED}),
];
