import { useMotionView } from "../store/session/networkViews";
import {AttackIcon} from './AttackIcon';
import {useCombatStore,type TankWeapon} from './combatStore';
import {secondaryDefinition} from './tankLoadout';

import {requestPrimaryFire,requestSecondaryFire,setWeaponHeld} from './turretControls';
import {canDrive} from '../controls/inputRouting';
import {HoldButton} from '../controls/TouchControls';
import {CooldownClock,CooldownDial} from './CooldownClock';
import {reloadState,weaponReload} from './weaponCooldown';

/** Primary is always the factory cannon. The secondary slot can select only
 * small arms; planned hardware has no live transport mapping. Equipped slots
 * stay highlighted independently of the last weapon sent over the wire. */
export function WeaponChoiceButton({weapon}:{weapon:TankWeapon}){
 const secondary=useCombatStore(s=>s.secondaryWeapon),enabled=useCombatStore(s=>s.enabled);
 const definition=secondaryDefinition(secondary),primary=weapon==='cannon';
 const planned=!primary&&definition.planned;
 const liveWeapon=primary?'cannon':definition.weapon;
 const supported=useMotionView(s=>liveWeapon!=='basket'||s.getMe()?.combat?.basket_reload!==undefined);
 const status=useMotionView(s=>reloadState(weaponReload(s.getMe()?.combat,liveWeapon??'coax')));
 const label=primary?'CANNON':definition.label;
 const fire=primary?requestPrimaryFire:requestSecondaryFire;
 return <HoldButton className="weapon-choice" aria-label={label} data-equipped={!planned&&supported} disabled={!enabled||!canDrive()||planned||!supported} data-ready={!planned&&status==='ready'} data-planned={planned} title={`${primary?'PRIMARY':`SECONDARY · ${definition.rangeMeters??'range pending'}${definition.rangeMeters?'m':''}`} · ${!supported?'Restart the Rust server to enable this mount':planned?'Mount unavailable':status==='waiting'?'Waiting for server':status==='cooling'?'Cooling down':'Ready'}`} onHold={held=>{setWeaponHeld('pointer',primary?'primary':'secondary',held);}} onClick={event=>{if(event.detail===0)fire();}}>
  {planned?<CooldownDial progress={0}><AttackIcon kind="coax"/></CooldownDial>:<CooldownClock weapon={liveWeapon??'coax'}><AttackIcon kind={primary?'cannon':'fire'}/></CooldownClock>}
  <span>{label}{planned?' · PLANNED':''}</span>
 </HoldButton>;
}
