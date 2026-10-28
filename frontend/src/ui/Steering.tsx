import { useRef } from "react";
import { useInputStore } from "../store/inputStore";
import { HoldButton } from "../controls/TouchControls";


export default function Steering() {
  const steer = useInputStore(s => s.input.steer), held = useRef({ left: false, right: false });
  const press = (action: "left" | "right", value: boolean) => {
    held.current[action] = value;
    useInputStore.getState().setAnalogFromSource("touch-steering", { steer: Number(held.current.right) - Number(held.current.left) });
  };
  return <div className="driving-steering" role="group" aria-label="Steering">
    <HoldButton aria-label="Steer left" aria-pressed={steer < 0} onHold={value => press("left", value)}>‹</HoldButton>
    <HoldButton aria-label="Steer right" aria-pressed={steer > 0} onHold={value => press("right", value)}>›</HoldButton>
  </div>;
}
