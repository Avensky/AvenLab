import { useEffect, type CSSProperties } from "react";
import { usePreferencesStore } from "../store/preferencesStore";
import ControlsPanel from "./ControlsPanel";
import Pedals from "./Pedals";
import Steering from "./Steering";
import Dashboard from "./Dashboard/Dashboard";
import { TouchStick } from "../controls/TouchControls";
import { usePerformanceOverlayStore } from "../performance/performanceOverlayStore";
import { useCanDataStore } from "../store/canDataStore";
import { useVehicleTelemetryStore,startVehicleTelemetry } from "../store/vehicleTelemetryStore";
import { HudGroup } from "./HudGroup";
import { ChatDock } from "./ChatDock";
import { IgnitionSwitch } from "./Cockpit/IgnitionSwitch";

export function DrivingHUD() {
  const layout=usePreferencesStore(s=>s.touchLayout),drivingLayout=usePreferencesStore(s=>s.drivingLayout);
  const touch=usePreferencesStore(s=>s.showTouchControls),dock=usePreferencesStore(s=>s.showDriveControls),drop=usePreferencesStore(s=>s.wheelDrop);
  const groups=usePreferencesStore(s=>s.hudGroups);
  const needsTelemetry=(touch&&groups.wheel)||(dock&&(groups.ignition||groups.display||groups.climate||groups.shifter||groups.parking||groups.assists));
  useEffect(()=>needsTelemetry?startVehicleTelemetry():undefined,[needsTelemetry]);
  const running=useVehicleTelemetryStore(s=>s.data.engineOn);
  const inspector=usePerformanceOverlayStore(s=>s.focused),command=useCanDataStore(s=>s.commandOpen);
  return <div className="driving-hud" data-touch-layout={layout} data-driving-layout={drivingLayout} data-touch-visible={touch} data-drive-controls={dock} inert={inspector||command} onPointerDown={event=>event.stopPropagation()} onPointerMove={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key===" "||event.key==="Enter")event.stopPropagation();}} onClick={event=>event.stopPropagation()}>
    <HudGroup id="gauges" title="INSTRUMENTS" className="instrument-hud"><Dashboard/></HudGroup>
    <ChatDock/>
    {touch&&<HudGroup id="wheel" title="STEERING" className="wheel-hud"><div className="wheel-stage" style={{'--wheel-drop':drop} as CSSProperties}><Steering/></div></HudGroup>}
    {touch&&<HudGroup id="pedals" title="PEDALS" className="pedal-hud">{layout==='pedals'?<Pedals/>:<><TouchStick axis="throttle"/><Pedals brakeOnly/></>}</HudGroup>}
    {dock&&<HudGroup key={running?'running':'stopped'} id="ignition" title="IGNITION" className="ignition-hud" defaultCollapsed={running}><IgnitionSwitch/></HudGroup>}
    <ControlsPanel/>
    <div className="hud-minimap-slot" data-hud-slot="minimap" aria-hidden="true"/>
  </div>;
}
