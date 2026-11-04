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
 description:'Control a heavy tracked vehicle. Protect a route, aim independently of the hull, and use Ram to break close-range pressure. Repair and refuel between fights.',
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
  {id:'scope',name:'SCOPE',icon:'scope',state:'live',description:'Enter the long-range aiming view. The scope temporarily frees turret aim and restores your previous angle-lock choice when you leave.',stats:[{label:'Controller',value:'D-pad Down'},{label:'Resource cost',value:'None'}],notes:'The research panel explains trajectory, range and gravity. The scope is an aiming view, not a damage multiplier.'},
  {id:'turret-utility',name:'ANGLE LOCK / RESET',icon:'lock',state:'live',description:'Angle Lock holds the current turret bearing and elevation relative to the hull. Free Aim releases it. Reset points the turret forward and restores angle lock afterward if it was previously on.',stats:[{label:'Lock',value:'R3 · full ring = locked'},{label:'Reset',value:'D-pad Up · 1 s cooldown'}],notes:'A sideways turret stays sideways when locked. Scope always uses free aim. These controls do not lock the tank body in place.'},
 ],
 ultimate:planned('ultimate','ULTIMATE','Ultimate charge can be earned from actual enemy damage. A usable tank ultimate is still being designed.','boost'),
};

/** Describes shipped behavior, not future role promises. Every hero has three
 * ability slots and one ultimate slot; unfinished actions stay visibly planned. */
export function getHeroAbilityGuide(hero:string):HeroAbilityGuide{
 if(hero==='tank')return tank;
 const definition=HEROES.find(item=>item.id===hero)??HEROES.find(item=>item.id==='brz')!;
 const support=definition.role==='support',mechanic=definition.id==='mechanic';
 return {
  hero:definition.id,role:definition.role.toUpperCase(),hp:500,
  description:mechanic?'Recover disabled teammates before their recovery window expires. Stop within eight metres and use Revive; additional repair and support abilities are still being developed.':support?'A support hero on the existing road-vehicle chassis. Dedicated ally repair, refueling and support abilities are pending. The current generic weapon test remains available.':'A road vehicle with arcade driving and the shared combat test. Unique weapons and three vehicle-specific abilities are still being developed.',
  weapons:[{id:'factory-gun',name:'FACTORY GUN · COMBAT TEST',icon:'coax',state:'live',description:'The current server-owned roof-center gun mount fires at the first target hit. Hero-specific twin guns, turrets and medic healing are pending.',stats:[{label:'Per hit',value:'8 HP'},{label:'Range',value:'200 m'}],notes:'The configured assault/support test fires every 0.1 s; the precision medic test uses 0.6 s. This gun does damage; selecting a medic role does not provide healing yet.'}],
  abilities:[mechanic?{id:'revive',name:'MECHANIC RECOVERY',icon:'repair',state:'live',description:'Recover a nearby disabled teammate in place before their recovery timer expires. It can also recover a fuel-empty teammate.',stats:[{label:'Range',value:'8 m · stop near ally'},{label:'Cooldown',value:'20 seconds'},{label:'Combat recovery',value:'30% hull HP · at least10% fuel'},{label:'Controller',value:'LB · recovery'}],notes:'Requires a living Mechanic, an ally within the live recovery window and safe placement. Combat revivals count as resurrections; fuel-only recovery refills actual fuel without inventing a kill or death.'}:planned('ability-one',support?'TEAM SUPPORT':'VEHICLE ABILITY','This hero-specific action is not implemented.'),planned('ability-two','MOBILITY ABILITY','The dedicated movement ability for this hero is pending.','boost'),planned('ability-three','UTILITY ABILITY','The third hero-specific action is pending.','scope')],
  ultimate:planned('ultimate','ULTIMATE','A unique ultimate is not implemented for this hero.','boost'),
 };
}

// Reuse the live HUD's descriptions and durations so help cannot disagree with
// the effects currently shown in battle. These are examples, not live buffs.
const empty=readEffectSignals(null);
export const HERO_EFFECT_GUIDE=[
 ...activeVehicleEffects({...empty,protection:2}),
 ...activeVehicleEffects({...empty,charge:3,ram:7}),
 ...activeVehicleEffects({...empty,ram:4}),
 ...activeVehicleEffects({...empty,boost:true}),
 ...activeVehicleEffects({...empty,stun:1}),
 ...activeVehicleEffects({...empty,resource:ResourceFlags.HOT}),
 ...activeVehicleEffects({...empty,resource:ResourceFlags.THERMAL_RECOVERY}),
 ...activeVehicleEffects({...empty,resource:ResourceFlags.DAMAGED}),
];
