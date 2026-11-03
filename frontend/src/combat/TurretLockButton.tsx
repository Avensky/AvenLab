import {useCombatStore} from './combatStore';
import {toggleTurretOrientationLock} from './turretControls';
import {CooldownDial} from './CooldownClock';
import {AttackIcon} from './AttackIcon';
export function TurretLockButton(){const locked=useCombatStore(s=>s.orientationLocked);return <button type="button" className="turret-lock" aria-label="Hull orientation lock" aria-pressed={locked} title="Hold the current turret bearing AND elevation relative to the hull · R3" onClick={toggleTurretOrientationLock}><CooldownDial progress={1}><AttackIcon kind={locked?'lock':'unlock'}/></CooldownDial><span>{locked?'ANGLE LOCK':'FREE AIM'}</span></button>;}
