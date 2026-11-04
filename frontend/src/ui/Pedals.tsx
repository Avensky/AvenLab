import { useId, useRef } from "react";
import { useInputStore } from "../store/input/inputStore";
import { HoldButton } from "../controls/TouchControls";
import { useMomentaryFeedback } from "./Cockpit/useMomentaryFeedback";

function PedalFace({ kind }: { kind: "reverse" | "brake" | "gas" }) {
  const metal = useId();
  const gas = kind === "gas";
  const outline = gas ? "M27 5h13l-4 38H21z" : "M10 13l5-5h32l5 6-3 22-5 4H14l-5-6z";
  return <svg className="pedal-face" viewBox={gas ? "14 -2 34 48" : "5 -2 52 48"} aria-hidden="true">
    <defs><linearGradient id={metal} x2=".85" y2="1" gradientUnits="objectBoundingBox">
      <stop stopColor="#ebf0ed"/><stop offset=".32" stopColor="#b0bdc0"/>
      <stop offset=".55" stopColor="#62747b"/><stop offset=".82" stopColor="#cad7da"/><stop offset="1" stopColor="#76878f"/>
    </linearGradient></defs>
    <path d="M29 0h7l-2 19h-7z" fill="#47545e" stroke="#1d242a"/>
    <path d={outline} fill={`url(#${metal})`} stroke="#d0dce1" strokeWidth="1.3" strokeLinejoin="round"/>
    {gas ? <path d="m29 11-3 26m7-26-3 26m7-26-3 26" fill="none" stroke="#29383f" strokeWidth="2" strokeLinecap="round"/> :
      kind === "brake" ? [17,26,35,44].flatMap(x => [16,24,32].map(y =>
        <circle key={x + "-" + y} cx={x} cy={y} r="2.4" fill="#243036" stroke="#bdcace" strokeWidth=".6"/>)) :
      <><path d="M17 13h26l3 3-2 16-3 3H18l-3-4z" fill="#27353e" stroke="#596b76"/>
        <path d="M26 31V17h6c7 0 6 8-1 8h-5m5 0 5 6" fill="none" stroke="#e2eaf0" strokeWidth="2.3"/></>}
  </svg>;
}

/** Pedals merge touch intent with other devices. Contact artwork is local to the
 * actual press; merged aria-pressed state must never leave a border selected. */
export default function Pedals({ brakeOnly = false }: { brakeOnly?: boolean }) {
  const contact = useMomentaryFeedback();
  const throttle = useInputStore((s) => s.input.throttle),
    brake = useInputStore((s) => s.input.brake);
  const held = useRef({ forward: false, reverse: false, brake: false });
  const press = (action: keyof typeof held.current, value: boolean) => {
    held.current[action] = value;
    useInputStore.getState().setAnalogFromSource("touch-pedals", {
      ...(brakeOnly
        ? {}
        : {
            throttle:
              Number(held.current.forward) - Number(held.current.reverse),
          }),
      brake: Number(held.current.brake),
    });
  };
  return (
    <div
      {...contact}
      className="driving-pedals"
      role="group"
      aria-label="Pedals"
    >
      {!brakeOnly && (
        <HoldButton
          className="driving-pedal driving-reverse"
          aria-label="Reverse"
          aria-pressed={throttle < 0}
          onHold={(value) => press("reverse", value)}
        >
          <PedalFace kind="reverse" />
          <span>R</span>
          <small>REVERSE</small>
        </HoldButton>
      )}
      <HoldButton
        className="driving-pedal driving-brake"
        aria-label="Brake"
        aria-pressed={brake > 0}
        onHold={(value) => press("brake", value)}
      >
        <PedalFace kind="brake" />
          <img src="/images/brakePedal.png" alt="" draggable={false} />
        <small>BRAKE</small>
      </HoldButton>
      {!brakeOnly && (
        <HoldButton
          className="driving-pedal driving-gas"
          aria-label="Accelerate"
          aria-pressed={throttle > 0}
          onHold={(value) => press("forward", value)}
        >
          <PedalFace kind="gas" />
          <img src="/images/gasPedal.png" alt="" draggable={false} />
          <small><span className="pedal-classic-name">GAS</span><span className="pedal-modern-name">THROTTLE</span></small>
        </HoldButton>
      )}
    </div>
  );
}
