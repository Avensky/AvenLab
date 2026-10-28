import { useEffect, type CSSProperties } from "react";
import { usePreferencesStore } from "../store/preferencesStore";
import {InspectionPanel} from "./InspectionPanel";
import {Minimap} from "./Minimap";
import ControlsPanel from "./ControlsPanel";
import Steering from "./Steering";
import Dashboard from "./Dashboard/Dashboard";
import { usePerformanceOverlayStore } from "../performance/performanceOverlayStore";
import { useCanDataStore } from "../store/canDataStore";
import { startVehicleTelemetry } from "../store/vehicleTelemetryStore";
import { HudGroup } from "./HudGroup";
import { IgnitionSwitch } from "./Cockpit/IgnitionSwitch";

export function DrivingHUD() {
  const drivingLayout=usePreferencesStore(s=>s.drivingLayout);
  const touch=usePreferencesStore(s=>s.showTouchControls),dock=usePreferencesStore(s=>s.showDriveControls),drop=usePreferencesStore(s=>s.wheelDrop);
  const groups=usePreferencesStore(s=>s.hudGroups);
  const needsTelemetry=(touch&&groups.wheel)||(dock&&(groups.ignition||groups.display||groups.climate||groups.shifter||groups.parking||groups.assists));
  useEffect(()=>needsTelemetry?startVehicleTelemetry():undefined,[needsTelemetry]);
  const inspector=usePerformanceOverlayStore(s=>s.focused),command=useCanDataStore(s=>s.commandOpen);
  return <div className="driving-hud" data-driving-layout={drivingLayout} data-touch-visible={touch} data-drive-controls={dock} inert={inspector||command} onPointerDown={event=>event.stopPropagation()} onPointerMove={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key===" "||event.key==="Enter")event.stopPropagation();}} onClick={event=>event.stopPropagation()}>
    <HudGroup id="gauges" title="INSTRUMENTS" className="instrument-hud"><Dashboard/></HudGroup>
    {touch&&<HudGroup id="wheel" title="STEERING" className="wheel-hud"><div className="wheel-stage" style={{'--wheel-drop':drop} as CSSProperties}><Steering/></div></HudGroup>}

    {dock&&<HudGroup id="ignition" title="IGNITION" className="ignition-hud"><IgnitionSwitch/></HudGroup>}
    <ControlsPanel/>
    <Minimap/><InspectionPanel/>
  </div>;
}
