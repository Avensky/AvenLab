import "./Cockpit/driverConsole.css";
import {memo} from "react";
import {useInputStore} from "../store/inputStore";
import {TouchStick} from "../controls/TouchControls";
import {MAX_WHEEL_ANGLE} from "../controls/wheelGeometry";
import {WheelArtwork} from "./Cockpit/WheelArtwork";
import {ColumnStalks} from "./Cockpit/ColumnStalks";
const WheelRotor=memo(function WheelRotor(){
 const steer=useInputStore(s=>s.input.steer);
 return <div className="wheel-rotor" style={{transform:`rotate(${steer*MAX_WHEEL_ANGLE}deg)`}}><WheelArtwork/></div>;
});
export default function Steering(){
 return <div className="wheel-assembly" aria-label="Driver steering wheel"><ColumnStalks/><TouchStick axis="steer" wheel><WheelRotor/></TouchStick></div>;
}
