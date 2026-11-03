import { ControllerButton, type ControllerKey } from "./ControllerButton";
const controls: [ControllerKey, string][] = [
  ["RT", "Accelerate"],
  ["LT", "Auto Drive: brake to stop, then reverse · release RT"],
  ["LS", "Steer · press to reset"],
  ["RS", "Aim while armed · press angle lock; otherwise downshift / dyno"],
  ["A", "Shift up · record when recorder is visible"],
  ["B", "Handbrake"],
  ["X", "Engine"],
  ["Y", "Cycle tank weapons while armed · otherwise lights"],
  ["LB", "Tank Ram while armed · NOS boost on cars"],
  ["RB", "Fire while armed · otherwise horn"],
  ["D-PAD", "Tank: up reset turret, down scope · cars: up hazards, down radio"],
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
