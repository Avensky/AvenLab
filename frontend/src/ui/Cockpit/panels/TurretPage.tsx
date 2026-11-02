import {useCombatStore} from '../../../combat/combatStore';
import {setTurretEnabled} from '../../../combat/turretControls';
import {TurretJoystick} from '../../../combat/TurretJoystick';
import {TurretInstruments} from '../../../combat/TurretInstruments';
export function TurretPage(){const enabled=useCombatStore(s=>s.enabled);return <section className="cockpit-turret-page" aria-label="Turret system"><label><input type="checkbox" checked={enabled} onChange={e=>setTurretEnabled(e.target.checked)}/> Turret controls</label><TurretJoystick/><TurretInstruments/><small>Stationary aim here. Close cockpit to drive/fire. Weapon setup: World Editor → Edit Vehicle → Weapons.</small></section>;}
