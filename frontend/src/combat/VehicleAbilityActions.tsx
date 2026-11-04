import {BarrageTrigger} from './BarrageTrigger';
import {ReviveAction} from './ReviveAction';
import {HealPackAction} from './HealPackAction';
import {GuardBoostAction,GuardAbilityAction} from './GuardBoostAction';
import {TankBarrierAction} from './TankBarrierAction';
import {useSocialStore} from '../store/social/socialStore';
import {heroForVehicle} from '../store/alpha/alphaStore';
import {getHeroAbilityGuide,type HeroAbility} from '../game/heroes/heroAbilityCatalog';
import {useMemo,useEffect,useRef,useState,type ReactNode} from 'react';
import {useNetworkStore} from '../store/session/networkStore';
import {canDrive} from '../controls/inputRouting';
import {HoldButton} from '../controls/TouchControls';
import {combatIntent,useCombatStore} from './combatStore';
import {AttackIcon} from './AttackIcon';
import {CooldownDial,SelectedCooldownClock} from './CooldownClock';
import {WeaponChoiceButton} from './WeaponChoiceButton';
import {RamAttack} from './RamAttack';
import {toggleTankScope,requestWeaponFire,cycleTankWeapon} from './turretControls';

/** Local feedback for testing reach and spacing. A preview never sends combat input. */
function TrialButton({ability}:{ability:HeroAbility}){
 const [pressed,setPressed]=useState(false), timer=useRef<number|undefined>(undefined);
 useEffect(()=>()=>window.clearTimeout(timer.current),[]);
 return <button type="button" data-trial="true" data-healing={ability.id==='field-patch'||ability.id==='triage'} data-preview-active={pressed}
  aria-label={ability.name+' · test slot'} title={ability.description+' · HUD preview'} onClick={()=>{
   if(!canDrive())return;
   window.clearTimeout(timer.current);setPressed(true);
   timer.current=window.setTimeout(()=>setPressed(false),650);
  }}><CooldownDial progress={pressed?0:1} label={pressed?'Testing control':'Test slot'}><AttackIcon kind={ability.icon}/></CooldownDial><span>{ability.name}</span><small role="status">{pressed?'TESTED':'TEST'}</small></button>;
}
/** Two columns, three rows. The bottom row is always primary / secondary. */
export function VehicleAbilityActions(){
 const vehicle=useNetworkStore(s=>s.getMe()?.vehicle_id);
 const seat=useSocialStore(s=>s.view?.alpha?.active);
 const room=useNetworkStore(s=>s.getMe()?.room_id),team=useNetworkStore(s=>s.getMe()?.team);
 const admitted=seat && room===seat.world_id && team===seat.team ? seat.hero : null;
 const mechanic=vehicle==='fortuner'&&admitted==='mechanic',rescue=vehicle==='cx30'&&admitted==='cx30';
 const pressure=useNetworkStore(s=>s.getMe()?.vehicle_id==='cx30'?s.getMe()?.combat?.ammo:undefined);
 const cooling=useNetworkStore(s=>(s.getMe()?.combat?.reload??0)>0);
 const scope=useCombatStore(s=>s.scope),secondary=useCombatStore(s=>s.secondaryWeapon);
 const actions:{id:string;face:ReactNode}[]=[];
 const kit=useMemo(()=>{
  const hero=heroForVehicle(vehicle);
  return hero?getHeroAbilityGuide(hero.id):null;
 },[vehicle]);
 if(!kit)return null;
 actions.push({id:'scope',face:<button type="button" className="turret-scope" disabled={!canDrive()} aria-label={vehicle==='tank'?'Tank scope':'Turret scope'} aria-pressed={scope} onClick={toggleTankScope}><CooldownDial progress={1}><AttackIcon kind="scope"/></CooldownDial><span>SCOPE</span></button>});
 if(vehicle==='tank')actions.push(
 {id:'ram',face:<RamAttack/>},
 {id:'machine-gun',face:<button type="button" className="secondary-choice" data-equipped={true} aria-label={`Cycle secondary weapon: ${secondary==='roof-mg'?'roof machine gun':'forward coax machine gun'} selected`} disabled={!canDrive()} title={`Cycle secondary machine gun · ${secondary === 'roof-mg' ? '800 m' : '200 m'} · Y / weapon-cycle keys · cannon stays primary`} onClick={()=>cycleTankWeapon(1)}><CooldownDial progress={1} label={secondary==='roof-mg'?'Roof MG selected':'Coax MG selected'}><AttackIcon kind={secondary==='roof-mg'?'roof-gun':'forward-gun'}/></CooldownDial><span><span className="turret-mount-label">{secondary==='roof-mg'?'ROOF MG · 800m':'COAX MG · 200m'}</span><span className="turret-cycle-label">CYCLE MG</span></span></button>},
 {id:'barrier',face:<TankBarrierAction/>},
 {id:'primary',face:<WeaponChoiceButton weapon="cannon"/>},
 {id:'secondary',face:<WeaponChoiceButton weapon="coax"/>});
 else {
  const liveAbility=(ability:HeroAbility)=>{
   if(ability.id==='revive' && mechanic)return <ReviveAction/>;
   if(ability.id==='guard-boost')return <GuardBoostAction/>;
   if(ability.id==='dive-shield')return <GuardAbilityAction kind="dive_shield"/>;
   return <TrialButton ability={ability}/>;
  };
  const [one,two]=kit.abilities;
  actions.push({id:one.id,face:liveAbility(one)},{id:two.id,face:liveAbility(two)},
   {id:kit.trialAccessory!.id,face:<TrialButton ability={kit.trialAccessory!}/>},
   {id:'ultimate',face:<BarrageTrigger tile/>});
  if(mechanic)actions.push({id:'health-pack',face:<HealPackAction/>});
  else actions.push({id:'fire',face:<HoldButton data-ready={!cooling} aria-label="FIRE" className="turret-fire" disabled={!canDrive()}
   onHold={held=>{if(held)requestWeaponFire();combatIntent.fire=held;}} onClick={e=>{if(e.detail===0)requestWeaponFire();}}>
   <SelectedCooldownClock><AttackIcon kind="fire"/></SelectedCooldownClock><span>{rescue?`SPRAY ${pressure??'—'}/10`:'FIRE'}</span></HoldButton>});
 }
 return <div className="turret-actions" aria-label="Vehicle abilities">{actions.map(a=><div key={vehicle+':'+a.id} className={`turret-orbit-${a.id}`}>{a.face}</div>)}</div>;
}
