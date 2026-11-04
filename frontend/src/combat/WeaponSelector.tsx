import {RamAttack} from './RamAttack';
import {WeaponChoiceButton} from './WeaponChoiceButton';
import {useCombatStore} from './combatStore';
import {secondaryDefinition} from './tankLoadout';
import {cycleTankWeapon} from './turretControls';
import {useNetworkStore} from '../store/session/networkStore';
import {useUIStore} from '../store/menus/uiStore';
import {usePreferencesStore} from '../store/preferences/preferencesStore';
import {combatKeyLabel} from '../store/preferences/keyBindings';
import './weaponSelector.css';
/** The same primary/secondary slots remain available with touch HUD hidden. */
export function WeaponSelector(){
 const enabled=useCombatStore(s=>s.enabled),secondary=useCombatStore(s=>s.secondaryWeapon);
 const vehicle=useNetworkStore(s=>s.getMe()?.vehicle_id),confirmed=useNetworkStore(s=>s.getMe()?.combat);
 const visible=useUIStore(s=>s.screen==='sandbox'&&s.overlay===null&&!s.isModeLoading);
 const orbit=usePreferencesStore(s=>s.showTouchControls&&s.hudGroups.turret);
 const keys=usePreferencesStore(s=>s.bindings);
 if(!enabled||vehicle!=='tank'||!visible||orbit)return null;
 const definition=secondaryDefinition(secondary),reload=confirmed?.cannon_reload??confirmed?.reload;
 return <section className="weapon-selector" data-radial={false} aria-label="Weapons">
  <div className="weapon-slots" role="group" aria-label="Primary and secondary weapons"><WeaponChoiceButton weapon="cannon"/><WeaponChoiceButton weapon="coax"/><button type="button" className="secondary-swap" aria-label="Cycle secondary weapon" onClick={()=>cycleTankWeapon()}>SWAP</button><RamAttack/></div>
  <div className="weapon-selector-footer" title="RB Cannon · D-pad Right Secondary · Y cycle secondary"><span>{combatKeyLabel(keys.fire)} CANNON · {combatKeyLabel(keys.secondaryFire)} SECONDARY · {combatKeyLabel(keys.previousWeapon)}/{combatKeyLabel(keys.nextWeapon)} SWAP</span><output aria-label="Weapon status">{reload===undefined?'WAITING':reload>0?`CANNON LOAD ${reload.toFixed(1)}s`:'CANNON READY'} · {definition.label}{definition.planned?' PLANNED':''}</output></div>
 </section>;
}
