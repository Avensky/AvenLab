import { useInputStore } from "../store/inputStore";
import { useUIStore } from "../store/uiStore";
import { VehicleFlags, hasFlag } from "../store/tools/inputMasks";
import { ActionButton } from "../controls/TouchControls";
import { usePreferencesStore } from "../store/preferencesStore";
import { useVehicleTelemetryStore } from "../store/vehicleTelemetryStore";
import { unpackCockpit } from "../store/tools/cockpitMasks";
import { DriveAssists } from "./Cockpit/DriveAssists";
import "./Cockpit/cockpit.css";

export default function ControlsPanel() {
  const vehicle=useInputStore(s=>s.input.vehicleMask);
  const expanded=usePreferencesStore(s=>s.showDriveControls);
  const confirmed=useVehicleTelemetryStore(s=>s.data.cockpitMask);
  const live=useVehicleTelemetryStore(s=>s.data.signal==='live'&&s.data.config.cockpitVersion>=2);
  const strength=unpackCockpit(confirmed??undefined).parkingStrength;
  const store=useInputStore.getState();
  return <div className="drive-dock" data-expanded={expanded} role="group" aria-label="Drive controls">
    <div className="drive-dock-header">
      <ActionButton className="engine-switch" aria-label="Engine" aria-pressed={hasFlag(vehicle,VehicleFlags.ENGINE_ON)} onClick={()=>store.toggleVehicleFlag(VehicleFlags.ENGINE_ON)}><img src="/images/onOff.svg" alt=""/></ActionButton>
      <ActionButton className="dock-open" aria-label="Open cockpit" title="Cockpit · F4 / Pause menu" onClick={()=>useUIStore.getState().openCockpit()}>COCKPIT</ActionButton>
    </div>
    {expanded && <><DriveAssists compact /><ActionButton className="dock-parking" aria-label="Parking brake strength" disabled={!live} aria-pressed={strength>0}
      onClick={()=>{const level=(strength+1)%4;store.setCockpit({parking:level>0,parkingStrength:level},3);}}>
      <span>PARKING BRAKE</span><span className="parking-steps" aria-hidden="true">{[1,2,3].map(level=><i key={level} data-lit={strength>=level}/>)}</span><strong>{Math.round(strength/3*100)}%</strong>
    </ActionButton></>}
  </div>;
}
