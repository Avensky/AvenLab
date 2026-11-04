import {ReviveAction} from './ReviveAction';
import {HealPackAction} from './HealPackAction';
import {GuardBoostAction,GuardAbilityAction} from './GuardBoostAction';
import {TankBarrierAction} from './TankBarrierAction';
import {useSocialStore} from '../store/social/socialStore';
import {type ReactNode} from 'react';
import {useNetworkStore} from '../store/session/networkStore';
import {canDrive} from '../controls/inputRouting';
import {HoldButton} from '../controls/TouchControls';
import {combatIntent,useCombatStore} from './combatStore';
import {AttackIcon} from './AttackIcon';
import {CooldownDial,SelectedCooldownClock} from './CooldownClock';
import {WeaponChoiceButton} from './WeaponChoiceButton';
import {RamAttack} from './RamAttack';
import {toggleTankScope,requestWeaponFire,cycleTankWeapon} from './turretControls';

/** Two columns, three rows. The bottom row is always primary / secondary. */
export function VehicleAbilityActions(){
 const vehicle=useNetworkStore(s=>s.getMe()?.vehicle_id);
 const mechanic=useSocialStore(s=>s.view?.alpha?.active?.hero==='mechanic');
 const guardDps=useSocialStore(s=>s.view?.alpha?.active?.hero==='brz');
 const pressure=useNetworkStore(s=>s.getMe()?.vehicle_id==='cx30'?s.getMe()?.combat?.ammo:undefined);
 const cooling=useNetworkStore(s=>(s.getMe()?.combat?.reload??0)>0);
 const scope=useCombatStore(s=>s.scope),secondary=useCombatStore(s=>s.secondaryWeapon);
 const actions:{id:string;face:ReactNode}[]=[];
 if(vehicle==='tank')actions.push(
 {id:'scope',face:<button type="button" className="turret-scope" disabled={!canDrive()} aria-label="Tank scope" aria-pressed={scope} onClick={toggleTankScope}><CooldownDial progress={1}><AttackIcon kind="scope"/></CooldownDial><span>SCOPE</span></button>},
 {id:'ram',face:<RamAttack/>},
 {id:'machine-gun',face:<button type="button" className="secondary-choice" data-equipped={true} aria-label={`Cycle secondary weapon: ${secondary==='roof-mg'?'roof machine gun':'forward coax machine gun'} selected`} disabled={!canDrive()} title="Cycle secondary machine gun · Y / weapon-cycle keys · cannon stays primary" onClick={()=>cycleTankWeapon(1)}><CooldownDial progress={1} label={secondary==='roof-mg'?'Roof MG selected':'Coax MG selected'}><AttackIcon kind={secondary==='roof-mg'?'roof-gun':'forward-gun'}/></CooldownDial><span>{secondary==='roof-mg'?'ROOF MG · 800m':'COAX MG · 200m'}</span></button>},
 {id:'barrier',face:<TankBarrierAction/>},
 {id:'primary',face:<WeaponChoiceButton weapon="cannon"/>},
 {id:'secondary',face:<WeaponChoiceButton weapon="coax"/>});
 else if(mechanic)actions.push({id:'revive',face:<ReviveAction/>},{id:'health-pack',face:<HealPackAction/>});
 else {if(guardDps&&vehicle==='brz')actions.push({id:'guard',face:<GuardBoostAction/>});if(vehicle==='cx30')actions.push({id:'dive',face:<GuardAbilityAction kind="dive_shield"/>});actions.push({id:'fire',face:<HoldButton data-ready={!cooling} aria-label="FIRE" className="turret-fire" disabled={!canDrive()} onHold={held=>{if(held)requestWeaponFire();combatIntent.fire=held;}} onClick={e=>{if(e.detail===0)requestWeaponFire();}}><SelectedCooldownClock><AttackIcon kind="fire"/></SelectedCooldownClock><span>{vehicle==='cx30'?`SPRAY ${pressure??'—'}/10`:'FIRE'}</span></HoldButton>});}
 return <div className="turret-actions" aria-label="Vehicle abilities">{actions.map(a=><div key={a.id} className={`turret-orbit-${a.id}`}>{a.face}</div>)}</div>;
}
