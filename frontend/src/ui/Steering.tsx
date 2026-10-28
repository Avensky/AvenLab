import { useRef } from "react";
import { useInputStore } from "../store/inputStore";
import { ActionButton, HoldButton } from "../controls/TouchControls";
import { VehicleFlags, hasFlag } from "../store/tools/inputMasks";

export default function Steering() {
  const steer = useInputStore(s => s.input.steer), held = useRef({ left: false, right: false });
  const flags = useInputStore(s => s.input.vehicleMask);
  const press = (action: "left" | "right", value: boolean) => {
    held.current[action] = value;
    useInputStore.getState().setAnalogFromSource("touch-steering", { steer: Number(held.current.right) - Number(held.current.left) });
  };
  return <div className="driving-steering" role="group" aria-label="Steering">
    <ActionButton className="wheel-turn wheel-turn-left" aria-label="Left indicator" aria-pressed={hasFlag(flags,VehicleFlags.BLINKER_LEFT)} onClick={()=>useInputStore.getState().toggleVehicleFlag(VehicleFlags.BLINKER_LEFT)}>◀</ActionButton>
    <svg className="steering-wheel-display" viewBox="0 0 40 40" aria-hidden="true" style={{transform:`translateX(-50%) rotate(${steer*35}deg)`}}><circle cx="20" cy="20" r="16" fill="#111820" stroke="#91a1b2" strokeWidth="3"/><path d="M5 18h30M20 20v16" stroke="#546271" strokeWidth="5"/><circle cx="20" cy="20" r="5" fill="#26333f"/></svg>
    <ActionButton className="wheel-turn wheel-turn-right" aria-label="Right indicator" aria-pressed={hasFlag(flags,VehicleFlags.BLINKER_RIGHT)} onClick={()=>useInputStore.getState().toggleVehicleFlag(VehicleFlags.BLINKER_RIGHT)}>▶</ActionButton>
    <HoldButton aria-label="Steer left" aria-pressed={steer < 0} onHold={value => press("left", value)}>‹</HoldButton>
    <HoldButton aria-label="Steer right" aria-pressed={steer > 0} onHold={value => press("right", value)}>›</HoldButton>
  </div>;
}
