import {MountPicker} from '../../../combat/MountPicker';
import {useMotionView} from '../../../store/session/networkViews';
import {HudVisibilityToggle} from './HudVisibilityToggle';
import {useCombatStore} from '../../../combat/combatStore';
import {setTurretEnabled} from '../../../combat/turretControls';
import {TurretJoystick} from '../../../combat/TurretJoystick';
import {TurretInstruments} from '../../../combat/TurretInstruments';
export function TurretPage() {
  const vehicle=useMotionView(s=>s.getMe()?.vehicle_id ?? '');
  const enabled=useCombatStore(s=>s.enabled);
  return <section className="cockpit-turret-page" aria-label="Turret system">
    <label><input type="checkbox" checked={enabled} onChange={e=>setTurretEnabled(e.target.checked)}/> Turret controls</label>
    <HudVisibilityToggle id="turret" label="Turret aim and fire on driving HUD"/>
    <HudVisibilityToggle id="shifter" label="Shifter on driving HUD"/>
    <MountPicker vehicle={vehicle}/><TurretJoystick/><TurretInstruments/>
    <small>Close the cockpit to drive and fire.</small>
  </section>;
}
