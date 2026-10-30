import { ResourceFlags } from "../../store/telemetry/resourceMasks";
import type { VehicleTelemetry } from "../../store/telemetry/vehicleTelemetryStore";

/** Preferences own the user's gain; confirmed engine state owns automatic
 * dimming. High contrast bypasses automatic dimming but honors manual choice. */
export function instrumentBrightness(
  level: number,
  engineOn: boolean,
  highContrast: boolean,
) {
  const gain = Number.isFinite(level) ? Math.max(0.1, Math.min(1, level)) : 1;
  return gain * (engineOn || highContrast ? 1 : 0.42);
}

export type DisplayPower =
  "off" | "on" | "cranking" | "running" | "unavailable";
export function displayPower(
  data: Pick<VehicleTelemetry, "signal" | "engineOn" | "resourceMask"> &
    Partial<Pick<VehicleTelemetry, "cabinMask">>,
): DisplayPower {
  if (data.signal !== "live") return "unavailable";
  if (data.resourceMask & ResourceFlags.STARTING) return "cranking";
  if (
    !data.engineOn &&
    data.cabinMask !== null &&
    data.cabinMask !== undefined &&
    data.cabinMask & (1 << 14) &&
    ((data.cabinMask >>> 10) & 3) === 2
  )
    return "on";
  return data.engineOn ? "running" : "off";
}
