import { engineDisplayState } from "../engineDisplayState";
import type { VehicleTelemetry } from "../../store/telemetry/vehicleTelemetryStore";

/** Preferences own the user's gain; confirmed display power owns automatic
 * dimming. High contrast bypasses automatic dimming but honors manual choice. */
export function instrumentBrightness(
  level: number,
  powered: boolean,
  highContrast: boolean,
) {
  const gain = Number.isFinite(level) ? Math.max(0.1, Math.min(1, level)) : 1;
  return gain * (powered || highContrast ? 1 : 0.42);
}

export type DisplayPower =
  "off" | "on" | "cranking" | "running" | "unavailable";
export function displayPower(
  data: Pick<VehicleTelemetry, "signal" | "engineOn" | "resourceMask"> &
    Partial<Pick<VehicleTelemetry, "cabinMask">>,
): DisplayPower {
  const state = engineDisplayState(data);
  if (state !== "off") return state;
  if (
    !data.engineOn &&
    data.cabinMask !== null &&
    data.cabinMask !== undefined &&
    data.cabinMask & (1 << 14) &&
    ((data.cabinMask >>> 10) & 3) === 2
  )
    return "on";
  return "off";
}
