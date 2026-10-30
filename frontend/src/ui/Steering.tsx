/** Driving-wheel composition. The wheel owns steering input; the separate saved
 * stalks visibility switch only mounts/unmounts the lever source and its cleanup. */
import "./Cockpit/driverConsole.css";
import { memo } from "react";
import { useInputStore } from "../store/input/inputStore";
import { TouchStick } from "../controls/TouchControls";
import { MAX_WHEEL_ANGLE } from "../controls/wheelGeometry";
import { WheelArtwork } from "./Cockpit/WheelArtwork";
import { ColumnStalks } from "./Cockpit/ColumnStalks";
import { usePreferencesStore } from "../store/preferences/index";
const WheelRotor = memo(function WheelRotor() {
  const steer = useInputStore((s) => s.input.steer);
  return (
    <div
      className="wheel-rotor"
      style={{ transform: `rotate(${steer * MAX_WHEEL_ANGLE}deg)` }}
    >
      <WheelArtwork />
    </div>
  );
});
export default function Steering() {
  const levers = usePreferencesStore((s) => s.hudGroups.stalks);
  return (
    <div className="wheel-assembly" aria-label="Driver steering wheel">
      {levers && <ColumnStalks />}
      <TouchStick axis="steer" wheel>
        <WheelRotor />
      </TouchStick>
    </div>
  );
}
