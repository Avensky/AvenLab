import {DrivingIgnition} from './Cockpit/DrivingIgnition';
import {useCombatStore} from '../combat/combatStore';
import {VehicleAimControls} from '../combat/TurretJoystick';
/** Driving console composition. Each group has its own persisted visibility;
 * the two physical levers are peers and the assist bank sits beside the pedals.
 * Components own requests, preferences own layout, Rust owns actual vehicle state. */
import "./Cockpit/driverConsole.css";
import "./Cockpit/cockpit.css";
import { usePreferencesStore } from "../store/preferences/index";
import { UtilityDock } from "./hud/UtilityDock";
import { DriveGearControl, ParkingBrakeControl } from "./Cockpit/DriveControls";
import { DriveAssists } from "./Cockpit/DriveAssists";
import { HudGroup } from "./HudGroup";
import Pedals from "./Pedals";
import { TouchStick } from "../controls/TouchControls";

export default function ControlsPanel() {
  const armed=useCombatStore(s=>s.enabled);
  const turret=usePreferencesStore(s=>s.hudGroups.turret);
  const expanded = usePreferencesStore((s) => s.showDriveControls),
    touch = usePreferencesStore((s) => s.showTouchControls),
    layout = usePreferencesStore((s) => s.touchLayout);
  const aimControls=armed&&touch&&turret;
  return (
    <>
      <UtilityDock />
      <aside
        className="drive-dock"
        data-expanded={expanded}
        data-aim-controls={aimControls}
        aria-label="Drive controls"
      >
        {(expanded||aimControls) && (
          <div className="dock-equipment">
            <div
              className={`transmission-console hud-transmission${aimControls?" ability-control-deck":""}`}
              data-compact="true"
            >
              {expanded&&<HudGroup
                id="parking"
                title="PARKING BRAKE"
                className="hud-parking"
              >
                <ParkingBrakeControl drift />
              </HudGroup>}
              <div className="hud-drive-turret-stack">
                {expanded&&<HudGroup id="shifter" title="SHIFTER" className="hud-shifter"><DriveGearControl /></HudGroup>}
                {aimControls&&<HudGroup id="turret" title="TURRET" className="hud-turret"><VehicleAimControls/></HudGroup>}
              </div>
            </div>
          </div>
        )}
        {/* This row defines the shared radio/HVAC width in styles/layout.css. */}
        <div className="console-foot-controls">
          {expanded&&<DrivingIgnition/>}
          {expanded && (
            <HudGroup
              id="assists"
              title="DRIVING ASSISTS"
              className="hud-assists"
            >
              <DriveAssists compact />
            </HudGroup>
          )}
          {touch && (
            <HudGroup id="pedals" title="PEDALS" className="pedal-hud">
              {layout === "pedals" ? (
                <Pedals />
              ) : (
                <>
                  <TouchStick axis="throttle" />
                  <Pedals brakeOnly />
                </>
              )}
            </HudGroup>
          )}
        </div>
      </aside>
    </>
  );
}
