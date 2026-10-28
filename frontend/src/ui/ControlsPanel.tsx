import "./Cockpit/driverConsole.css";
import "./Cockpit/cockpit.css";
import { useUIStore } from "../store/uiStore";
import { ActionButton } from "../controls/TouchControls";
import { usePreferencesStore } from "../store/preferencesStore";
import { ConsoleDisplay } from "./Cockpit/ConsoleDisplay";
import { ClimatePanel } from "./Cockpit/ClimatePanel";
import { DriveGearControl,ParkingBrakeControl } from "./Cockpit/DriveControls";
import { DriveAssists } from "./Cockpit/DriveAssists";
import { HudGroup } from "./HudGroup";

export default function ControlsPanel() {
  const expanded=usePreferencesStore(s=>s.showDriveControls);
  return <aside className="drive-dock" data-expanded={expanded} aria-label="Drive controls">
    <div className="drive-dock-header">
      <ActionButton aria-label="HUD settings" onClick={()=>useUIStore.getState().setOverlay('settings')}>HUD</ActionButton>
      <ActionButton className="dock-open" aria-label="Open cockpit" title="Cockpit · F4" onClick={()=>useUIStore.getState().openCockpit()}>COCKPIT</ActionButton>
    </div>
    {expanded&&<>
      <HudGroup id="display" title="VEHICLE DISPLAY" defaultCollapsed><ConsoleDisplay/></HudGroup>
      <HudGroup id="climate" title="CLIMATE" defaultCollapsed><ClimatePanel/></HudGroup>
      <div className="transmission-console hud-transmission" data-compact="true">
        <HudGroup id="parking" title="PARKING BRAKE" className="hud-parking"><ParkingBrakeControl/></HudGroup>
        <HudGroup id="shifter" title="SHIFTER" className="hud-shifter"><DriveGearControl/></HudGroup>
      </div>
      <HudGroup id="assists" title="DRIVING ASSISTS" defaultCollapsed><DriveAssists compact/></HudGroup>
    </>}
  </aside>;
}
