import { ControllerButton, type ControllerKey } from "./ControllerButton";
const controls: [ControllerKey, string][] = [
  ["RT", "Accelerate"],
  ["LT", "Brake"],
  ["LS", "Steer · press to reset"],
  ["RS", "Press to shift down / dyno"],
  ["A", "Shift up · record when recorder is visible"],
  ["B", "Handbrake"],
  ["X", "Engine"],
  ["Y", "Lights"],
  ["LB", "NOS boost"],
  ["RB", "Horn"],
  ["D-PAD", "Left/right indicators · up hazards · down radio"],
  ["START", "Pause / resume"],
  ["VIEW", "Performance details · LB + View cockpit"],
];
export function ControllerGuide() {
  return (
    <div className="controller-guide" aria-label="Driving controller shortcuts">
      {controls.map(([button, label]) => (
        <span key={button}>
          <ControllerButton button={button} />
          {label}
        </span>
      ))}
    </div>
  );
}
