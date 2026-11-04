import {TURRET_LOCK_COOLDOWN_MS,useCombatStore} from './combatStore';
import {toggleTurretOrientationLock} from './turretControls';
import {CooldownDial} from './CooldownClock';
import {AttackIcon} from './AttackIcon';
import {useCooldownProgress} from './useCooldownProgress';
export function TurretLockButton(){
 const locked=useCombatStore(s=>s.orientationLocked),readyAt=useCombatStore(s=>s.turretLockReadyAt),enabled=useCombatStore(s=>s.enabled),scope=useCombatStore(s=>s.scope);
 const debounce=useCooldownProgress(readyAt,TURRET_LOCK_COOLDOWN_MS);
 const progress=locked?debounce:1-debounce;
 return <button type="button" className="turret-lock" aria-label="Hull orientation lock" aria-pressed={locked} disabled={!enabled||scope||debounce<1} data-ready={debounce===1} data-locked={locked} title="Move the aim stick to adjust bearing and elevation. Release to hold the new angle relative to the hull · R3 · brief fill/drain on toggle · full ring means locked, empty means free aim" onClick={toggleTurretOrientationLock}>
  <CooldownDial progress={progress} label={locked?'Turret angle locked':'Turret free aim'}><AttackIcon kind={locked?'lock':'unlock'}/></CooldownDial><span>{locked?'ANGLE LOCK':'FREE AIM'}</span>
 </button>;
}
