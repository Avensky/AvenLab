import {RamAttack} from './RamAttack';
import {WeaponChoiceButton} from './WeaponChoiceButton';
import {useCombatStore} from './combatStore';
import {useNetworkStore} from '../store/session/networkStore';
import {useUIStore} from '../store/menus/uiStore';
import {usePreferencesStore} from '../store/preferences/preferencesStore';
import {combatKeyLabel} from '../store/preferences/keyBindings';
import './weaponSelector.css';
/** The orbit owns touch weapon selection; this bar is its keyboard/controller fallback. */
export function WeaponSelector(){
 const enabled=useCombatStore(s=>s.enabled),selected=useCombatStore(s=>s.weapon);
 const vehicle=useNetworkStore(s=>s.getMe()?.vehicle_id),confirmed=useNetworkStore(s=>s.getMe()?.combat);
 const visible=useUIStore(s=>s.screen==='sandbox'&&s.overlay===null&&!s.isModeLoading);
 const orbit=usePreferencesStore(s=>s.showTouchControls&&s.hudGroups.turret);
 const keys=usePreferencesStore(s=>s.bindings);
 if(!enabled||vehicle!=='tank'||!visible||orbit)return null;
 const status=confirmed?.weapon!==selected?'SWITCHING':confirmed?.reload&&confirmed.reload>0?`LOAD ${confirmed.reload.toFixed(1)}s`:'READY';
 return <section className="weapon-selector" data-radial={orbit} aria-label="Weapons">
  {orbit?<RamAttack/>:<div className="weapon-slots" role="group" aria-label="Select weapon"><WeaponChoiceButton weapon="cannon"/><WeaponChoiceButton weapon="coax"/><RamAttack/></div>}
  <div className="weapon-selector-footer"><span>{combatKeyLabel(keys.fire)} FIRE · {combatKeyLabel(keys.previousWeapon)}/{combatKeyLabel(keys.nextWeapon)} SWAP</span><output aria-label="Weapon status">{status}</output></div>
 </section>;
}
