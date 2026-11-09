import type { Preferences } from "../store/preferences/preferencesStore";

export function controllerAxis(value = 0, deadzone = 0.12) {
  return Number.isFinite(value) && Math.abs(value) >= deadzone
    ? Math.max(-1, Math.min(1, value))
    : 0;
}

export function calibratedSteering(
  input: number | undefined,
  { controllerDeadzone, steeringSensitivity, invertSteering }: Pick<
    Preferences, "controllerDeadzone" | "steeringSensitivity" | "invertSteering"
  >,
) {
  const steer = controllerAxis(input, controllerDeadzone) * steeringSensitivity;
  return Math.max(-1, Math.min(1, invertSteering ? -steer : steer));
}
