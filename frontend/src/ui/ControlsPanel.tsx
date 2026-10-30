/** Driving console composition. Each group has its own persisted visibility;
 * the two physical levers are peers and the assist bank wraps beside the pedals.
 * Components own requests, preferences own layout, Rust owns actual vehicle state. */
import "./Cockpit/driverConsole.css";
import "./Cockpit/cockpit.css";
import { usePreferencesStore } from "../store/preferences/index";
import { ConsoleDisplay } from "./Cockpit/ConsoleDisplay";
import { ClimatePanel } from "./Cockpit/ClimatePanel";
import { DriveGearControl, ParkingBrakeControl } from "./Cockpit/DriveControls";
import { DriveAssists } from "./Cockpit/DriveAssists";
import { HudGroup } from "./HudGroup";
import Pedals from "./Pedals";
import { TouchStick } from "../controls/TouchControls";

export default function ControlsPanel() {
  const climateVisible = usePreferencesStore((s) => s.hudGroups.climate),
    hazardsVisible = usePreferencesStore((s) => s.hudGroups.hazards);
  const climateSize = usePreferencesStore((s) => s.climateHudSize);
  const expanded = usePreferencesStore((s) => s.showDriveControls),
    touch = usePreferencesStore((s) => s.showTouchControls),
    layout = usePreferencesStore((s) => s.touchLayout);
  return (
    <aside
      className="drive-dock"
      data-expanded={expanded}
      aria-label="Drive controls"
    >
      {expanded && (
        <div className="dock-equipment">
          <HudGroup id="display" title="VEHICLE DISPLAY">
            <ConsoleDisplay />
          </HudGroup>
          {climateVisible && (
            <HudGroup id="climate" title="CLIMATE" className="hud-climate">
              <ClimatePanel size={climateSize} showHazards={hazardsVisible} />
            </HudGroup>
          )}
          <div
            className="transmission-console hud-transmission"
            data-compact="true"
          >
            <HudGroup
              id="parking"
              title="PARKING BRAKE"
              className="hud-parking"
            >
              <ParkingBrakeControl drift />
            </HudGroup>
            <HudGroup id="shifter" title="SHIFTER" className="hud-shifter">
              <DriveGearControl />
            </HudGroup>
          </div>
        </div>
      )}
      {/* Wrap on narrow screens rather than overlap the steering wheel. */}
      <div className="console-foot-controls">
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
  );
}
