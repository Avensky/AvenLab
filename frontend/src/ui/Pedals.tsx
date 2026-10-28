import { useRef } from "react";
import { useInputStore } from "../store/inputStore";
import { HoldButton } from "../controls/TouchControls";

export default function Pedals({ brakeOnly = false }: { brakeOnly?: boolean }) {
  const throttle = useInputStore(s => s.input.throttle), brake = useInputStore(s => s.input.brake);
  const held = useRef({ forward: false, reverse: false, brake: false });
  const press = (action: keyof typeof held.current, value: boolean) => {
    held.current[action] = value;
    useInputStore.getState().setAnalogFromSource("touch-pedals", {
      ...(brakeOnly ? {} : { throttle: Number(held.current.forward) - Number(held.current.reverse) }), brake: Number(held.current.brake),
    });
  };
  return <div className="driving-pedals" role="group" aria-label="Pedals">
    {!brakeOnly && <HoldButton className="driving-pedal driving-reverse" aria-label="Reverse" aria-pressed={throttle < 0} onHold={value => press("reverse", value)}><span>R</span><small>REVERSE</small></HoldButton>}
    <HoldButton className="driving-pedal driving-brake" aria-label="Brake" aria-pressed={brake > 0} onHold={value => press("brake", value)}><img src="/images/brakePedal.png" alt="" draggable={false} /><small>BRAKE</small></HoldButton>
    {!brakeOnly && <HoldButton className="driving-pedal driving-gas" aria-label="Accelerate" aria-pressed={throttle > 0} onHold={value => press("forward", value)}><img src="/images/gasPedal.png" alt="" draggable={false} /><small>GAS</small></HoldButton>}
  </div>;
}
