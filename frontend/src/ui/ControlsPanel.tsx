import "./Cockpit/driverConsole.css";
import { useInputStore } from "../store/inputStore";
import { useUIStore } from "../store/uiStore";
import { VehicleFlags, hasFlag } from "../store/tools/inputMasks";
import { ActionButton } from "../controls/TouchControls";
import { usePreferencesStore } from "../store/preferencesStore";
import { ConsoleDisplay } from "./Cockpit/ConsoleDisplay";
import { ClimatePanel } from "./Cockpit/ClimatePanel";
import { DriveControls } from "./Cockpit/DriveControls";
import "./Cockpit/cockpit.css";

export default function ControlsPanel() {
  const vehicle=useInputStore(s=>s.input.vehicleMask);
  const expanded=usePreferencesStore(s=>s.showDriveControls);
  const store=useInputStore.getState();
  return <div className="drive-dock" data-expanded={expanded} role="group" aria-label="Drive controls">
    <div className="drive-dock-header">
      <ActionButton className="engine-switch" aria-label="Engine" aria-pressed={hasFlag(vehicle,VehicleFlags.ENGINE_ON)} onClick={()=>store.toggleVehicleFlag(VehicleFlags.ENGINE_ON)}><img src="/images/onOff.svg" alt=""/></ActionButton>
      <ActionButton className="dock-open" aria-label="Open cockpit" title="Cockpit · F4 / Pause menu" onClick={()=>useUIStore.getState().openCockpit()}>COCKPIT</ActionButton>
    </div>
    {expanded && <><ConsoleDisplay/><ClimatePanel/><DriveControls compact initializeManual/></>}
  </div>;
}
