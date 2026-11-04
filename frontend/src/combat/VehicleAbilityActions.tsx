import {ReviveAction} from './ReviveAction';
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
import {toggleTankScope,requestWeaponFire} from './turretControls';

/** Two columns, three rows. The bottom row is always primary / secondary. */
export function VehicleAbilityActions(){
 const vehicle=useNetworkStore(s=>s.getMe()?.vehicle_id);
 const mechanic=useSocialStore(s=>s.view?.alpha?.active?.hero==='mechanic');
 const cooling=useNetworkStore(s=>(s.getMe()?.combat?.reload??0)>0);
 const scope=useCombatStore(s=>s.scope),secondary=useCombatStore(s=>s.secondaryWeapon);
 const actions:{id:string;face:ReactNode}[]=[];
 if(vehicle==='tank')actions.push(
 {id:'scope',face:<button type="button" className="turret-scope" disabled={!canDrive()} aria-label="Tank scope" aria-pressed={scope} onClick={toggleTankScope}><CooldownDial progress={1}><AttackIcon kind="scope"/></CooldownDial><span>SCOPE</span></button>},
 {id:'ram',face:<RamAttack/>},
 {id:'roof',face:<button type="button" className="secondary-choice" aria-label="Select roof machine gun" aria-pressed={secondary==='roof-mg'} disabled={!canDrive()} title="Roof MG · 800m · Y / weapon-cycle keys also change secondary small arms" onClick={()=>useCombatStore.getState().selectSecondary('roof-mg')}><CooldownDial progress={secondary==='roof-mg'?1:0} label={secondary==='roof-mg'?'Roof MG selected':'Roof MG not selected'}><AttackIcon kind="roof-gun"/></CooldownDial><span>ROOF MG · 800m</span></button>},
 {id:'forward',face:<button type="button" className="secondary-choice" aria-label="Select forward coax machine gun" aria-pressed={secondary==='forward-mg'} disabled={!canDrive()} title="Forward coax MG · 200m · shares turret yaw and gun elevation" onClick={()=>useCombatStore.getState().selectSecondary('forward-mg')}><CooldownDial progress={secondary==='forward-mg'?1:0} label={secondary==='forward-mg'?'Coax MG selected':'Coax MG not selected'}><AttackIcon kind="forward-gun"/></CooldownDial><span>COAX MG · 200m</span></button>},
 {id:'primary',face:<WeaponChoiceButton weapon="cannon"/>},
 {id:'secondary',face:<WeaponChoiceButton weapon="coax"/>});
 else {if(mechanic)actions.push({id:'revive',face:<ReviveAction/>});actions.push({id:'fire',face:<HoldButton data-ready={!cooling} aria-label="FIRE" className="turret-fire" disabled={!canDrive()} onHold={held=>{if(held)requestWeaponFire();combatIntent.fire=held;}} onClick={e=>{if(e.detail===0)requestWeaponFire();}}><SelectedCooldownClock><AttackIcon kind="fire"/></SelectedCooldownClock><span>FIRE</span></HoldButton>});}
 return <div className="turret-actions" aria-label="Vehicle abilities">{actions.map(a=><div key={a.id} className={`turret-orbit-${a.id}`}>{a.face}</div>)}</div>;
}
