import {useCooldownProgress} from './useCooldownProgress';
import {TURRET_RESET_COOLDOWN_MS,useCombatStore} from './combatStore';
import {resetTurretOrientation} from './turretControls';
import {CooldownDial} from './CooldownClock';
import {AttackIcon} from './AttackIcon';

/** All reset inputs share one deadline. Only this small dial animates its refill;
 * remounting the HUD cannot bypass the controller/keyboard/pointer cooldown. */
export function TurretResetButton(){
 const readyAt=useCombatStore(s=>s.turretResetReadyAt),enabled=useCombatStore(s=>s.enabled);
 const progress=useCooldownProgress(readyAt,TURRET_RESET_COOLDOWN_MS);
 return <button type="button" className="turret-reset" aria-label="Reset turret forward" title="Reset turret forward, then restore your previous angle-lock state · D-pad Up · 1 second cooldown" disabled={!enabled||progress<1} data-ready={progress===1} onClick={resetTurretOrientation}>
  <CooldownDial progress={progress}><AttackIcon kind="reset"/></CooldownDial><span>RESET</span>
 </button>;
}
