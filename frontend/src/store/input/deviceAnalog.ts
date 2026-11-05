export interface VehicleControlInput {
  throttle: number; // [-1..1]
  steer: number; // [-1..1]
  brake: number; // [0..1]
  handbrake: number; // [0..1]
}

export type InputSource =
  | "keyboard"
  | "gamepad"
  | "touch-steering"
  | "touch-throttle"
  | "touch-pedals"
  | "touch-actions"
  | "touch-parking"
  | "ebrake-pull";
const neutralControls = (): VehicleControlInput => ({
  throttle: 0,
  steer: 0,
  brake: 0,
  handbrake: 0,
});
// Device intent lives here, outside React. Only the merged packet goes to Rust.
const analogSources: Record<InputSource, VehicleControlInput> = {
  keyboard: neutralControls(),
  gamepad: neutralControls(),
  "touch-steering": neutralControls(),
  "touch-throttle": neutralControls(),
  "touch-pedals": neutralControls(),
  "touch-actions": neutralControls(),
  "touch-parking": neutralControls(),
  "ebrake-pull": neutralControls(),
};
export const clampControl = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value !== 0
    ? Math.max(min, Math.min(max, value))
    : 0;

const sourcePriority: readonly InputSource[] = [
  "keyboard", "touch-steering", "touch-throttle", "touch-pedals",
  "touch-actions", "touch-parking", "ebrake-pull", "gamepad",
];
const axes = ["throttle", "steer", "brake", "handbrake"] as const;
const merged = neutralControls();

// The highest priority nonzero throttle and steer win independently. Brakes
// take the strongest request from any device. The cache stays outside React.
function mergedAnalog(): VehicleControlInput {
  merged.throttle = merged.steer = merged.brake = merged.handbrake = 0;
  for (const source of sourcePriority) {
    const intent = analogSources[source];
    if (!merged.throttle) merged.throttle = intent.throttle;
    if (!merged.steer) merged.steer = intent.steer;
    merged.brake = Math.max(merged.brake, intent.brake);
    merged.handbrake = Math.max(merged.handbrake, intent.handbrake);
  }
  return merged;
}

export function clearAnalogSources() {
  for (const source of sourcePriority) analogSources[source] = neutralControls();
  return mergedAnalog();
}

export function updateDeviceAnalog(source: InputSource, partial: Partial<VehicleControlInput>): Readonly<VehicleControlInput> {
  const intent = analogSources[source];
  let changed = false;
  for (const axis of axes) {
    if (!Object.hasOwn(partial, axis)) continue;
    const value = clampControl(partial[axis] ?? 0, axis === "throttle" || axis === "steer" ? -1 : 0, 1);
    if (intent[axis] !== value) {
      intent[axis] = value;
      changed = true;
    }
  }
  return changed ? mergedAnalog() : merged;
}

export function releaseDeviceAnalog(source: InputSource): Readonly<VehicleControlInput> {
  analogSources[source] = neutralControls();
  return mergedAnalog();
}
