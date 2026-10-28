import { usePreferencesStore } from "../store/preferencesStore";
import ControlsPanel from "./ControlsPanel";
import Pedals from "./Pedals";
import Steering from "./Steering";
import Dashboard from "./Dashboard/Dashboard";
import { TouchStick } from "../controls/TouchControls";
import { usePerformanceOverlayStore } from "../performance/performanceOverlayStore";
import { useCanDataStore } from "../store/canDataStore";

export function DrivingHUD() {
  const layout = usePreferencesStore(s => s.touchLayout);
  const inspector = usePerformanceOverlayStore(s => s.focused), command = useCanDataStore(s => s.commandOpen);
  return <div className="driving-hud" data-touch-layout={layout} inert={inspector || command} onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <ControlsPanel />
    {layout === "pedals" ? <><Steering /><Pedals /></> : <><TouchStick axis="steer" /><TouchStick axis="throttle" /><Pedals brakeOnly /></>}
    <Dashboard />
  </div>;
}
