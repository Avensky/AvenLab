import {HudVisibilityToggle} from './HudVisibilityToggle';
import {useCombatStore} from '../../../combat/combatStore';
import {setTurretEnabled} from '../../../combat/turretControls';
import {TurretJoystick} from '../../../combat/TurretJoystick';
import {TurretInstruments} from '../../../combat/TurretInstruments';
export function TurretPage(){const enabled=useCombatStore(s=>s.enabled);return <section className="cockpit-turret-page" aria-label="Turret system"><label><input type="checkbox" checked={enabled} onChange={e=>setTurretEnabled(e.target.checked)}/> Turret controls</label><HudVisibilityToggle id="turret" label="Turret aim and fire on driving HUD"/><HudVisibilityToggle id="shifter" label="Shifter on driving HUD"/><TurretJoystick/><TurretInstruments/><small>Stationary aim here. Close cockpit to drive/fire. Weapon setup: World Editor → Edit Vehicle → Weapons.</small></section>;}
