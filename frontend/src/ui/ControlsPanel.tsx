import "./Cockpit/driverConsole.css";
import "./Cockpit/cockpit.css";
import { usePreferencesStore } from "../store/preferencesStore";
import { ConsoleDisplay } from "./Cockpit/ConsoleDisplay";
import { ClimatePanel } from "./Cockpit/ClimatePanel";
import { DriveGearControl,ParkingBrakeControl } from "./Cockpit/DriveControls";
import { DriveAssists } from "./Cockpit/DriveAssists";
import { HudGroup } from "./HudGroup";
import Pedals from "./Pedals";
import { TouchStick } from "../controls/TouchControls";

export default function ControlsPanel() {
 const expanded=usePreferencesStore(s=>s.showDriveControls),touch=usePreferencesStore(s=>s.showTouchControls),layout=usePreferencesStore(s=>s.touchLayout);
 return <aside className="drive-dock" data-expanded={expanded} aria-label="Drive controls">
  {expanded&&<div className="dock-equipment">
   <HudGroup id="display" title="VEHICLE DISPLAY"><ConsoleDisplay/></HudGroup>
   <HudGroup id="climate" title="CLIMATE"><ClimatePanel/></HudGroup>
   <div className="transmission-console hud-transmission" data-compact="true">
    <HudGroup id="parking" title="PARKING BRAKE" className="hud-parking"><ParkingBrakeControl/></HudGroup>
    <HudGroup id="assists" title="DRIVING ASSISTS" className="hud-assists"><DriveAssists compact/></HudGroup>
    <HudGroup id="shifter" title="SHIFTER" className="hud-shifter"><DriveGearControl/></HudGroup>
   </div>
  </div>}
  {touch&&<HudGroup id="pedals" title="PEDALS" className="pedal-hud">{layout==='pedals'?<Pedals/>:<><TouchStick axis="throttle"/><Pedals brakeOnly/></>}</HudGroup>}
 </aside>;
}
