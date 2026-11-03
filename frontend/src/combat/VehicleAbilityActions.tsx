import {type ReactNode} from 'react';
import {useNetworkStore} from '../store/session/networkStore';
import {canDrive} from '../controls/inputRouting';
import {HoldButton} from '../controls/TouchControls';
import {combatIntent,useCombatStore} from './combatStore';
import {AttackIcon} from './AttackIcon';
import {CooldownDial,SelectedCooldownClock} from './CooldownClock';
import {WeaponChoiceButton} from './WeaponChoiceButton';
import {TurretLockButton} from './TurretLockButton';
import {RamAttack} from './RamAttack';
import {resetTurretOrientation,toggleTankScope} from './turretControls';

/** Vehicle loadouts supply actions to one HUD layout. Future mounts reuse this
 * deck and aim owner; no vehicle should introduce another floating combat HUD. */
export function VehicleAbilityActions(){
 const vehicle=useNetworkStore(s=>s.getMe()?.vehicle_id);
 const cooling=useNetworkStore(s=>(s.getMe()?.combat?.reload??0)>0);
 const scope=useCombatStore(s=>s.scope);
 const actions:{id:string;face:ReactNode}[]=[{id:'fire',face:<HoldButton data-ready={!cooling} aria-label="FIRE" className="turret-fire" disabled={!canDrive()} onHold={held=>{combatIntent.fire=held;}}><SelectedCooldownClock><AttackIcon kind="fire"/></SelectedCooldownClock><span>FIRE</span></HoldButton>}];
 if(vehicle==='tank')actions.push({id:'primary',face:<WeaponChoiceButton weapon="cannon"/>},{id:'secondary',face:<WeaponChoiceButton weapon="coax"/>});
 actions.push({id:'lock',face:<TurretLockButton/>});
 if(vehicle==='tank')actions.push(
 {id:'reset',face:<button type="button" className="turret-reset" aria-label="Reset turret forward" onClick={resetTurretOrientation}><CooldownDial progress={1}><AttackIcon kind="reset"/></CooldownDial><span>RESET</span></button>},
 {id:'scope',face:<button type="button" className="turret-scope" disabled={!canDrive()} aria-label="Tank scope" aria-pressed={scope} onClick={toggleTankScope}><CooldownDial progress={1}><AttackIcon kind="scope"/></CooldownDial><span>SCOPE</span></button>},
 {id:'ram',face:<RamAttack/>});
 return <div className="turret-actions" aria-label="Vehicle abilities">{actions.map(a=><div key={a.id} className={`turret-orbit-${a.id}`}>{a.face}</div>)}</div>;
}
