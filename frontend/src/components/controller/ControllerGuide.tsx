import { ControllerButton, type ControllerKey } from "./ControllerButton";
const controls: [ControllerKey, string][] = [
  ["RT", "Accelerate"],
  ["LT", "Service brake · automatic Drive: stop, then reverse with RT released"],
  ["LS", "Steer · press to reset"],
  ["RS", "Aim while armed · press angle lock; otherwise downshift / dyno"],
  ["A", "Shift up · record when recorder is visible"],
  ["B", "E-brake · sharp rotation / slide; release to regain grip"],
  ["X", "Engine"],
  ["Y", "Cycle secondary small arms while tank armed · otherwise lights"],
  ["LB", "Tank Ram · Mechanic revive · NOS boost on other cars"],
  ["RB", "Tank cannon · armed car fire · otherwise horn"],
  ["D-PAD", "Tank: right secondary fire, up reset turret, down scope · cars: up hazards, down radio"],
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
