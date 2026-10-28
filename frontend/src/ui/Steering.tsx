import "./Cockpit/driverConsole.css";
import { useInputStore } from "../store/inputStore";
import { TouchStick } from "../controls/TouchControls";
import { MAX_WHEEL_ANGLE } from "../controls/wheelGeometry";
import { WheelArtwork } from "./Cockpit/WheelArtwork";
import { ColumnStalks } from "./Cockpit/ColumnStalks";
export default function Steering() {
  const steer=useInputStore(s=>s.input.steer);
  return <div className="wheel-assembly" aria-label="Driver steering wheel">
    <ColumnStalks/>
    <TouchStick axis="steer" wheel><div className="wheel-rotor" style={{transform:`rotate(${steer*MAX_WHEEL_ANGLE}deg)`}}><WheelArtwork/></div></TouchStick>
  </div>;
}
