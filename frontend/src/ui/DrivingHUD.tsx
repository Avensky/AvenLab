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
  const drivingLayout = usePreferencesStore(s => s.drivingLayout);
  const touch = usePreferencesStore(s => s.showTouchControls);
  const dock = usePreferencesStore(s => s.showDriveControls);
  const inspector = usePerformanceOverlayStore(s => s.focused), command = useCanDataStore(s => s.commandOpen);
  return <div className="driving-hud" data-touch-layout={layout} data-driving-layout={drivingLayout} data-touch-visible={touch} data-drive-controls={dock} inert={inspector || command} onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <ControlsPanel />
    <div className="driver-station" data-wheel-visible={touch}><Dashboard/>{touch&&<Steering/>}</div>
    {touch && (layout === "pedals" ? <Pedals /> : <><TouchStick axis="throttle" /><Pedals brakeOnly /></>)}
  </div>;
}
