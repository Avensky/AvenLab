import { ResourceFlags } from "../../store/telemetry/resourceMasks";
import type { VehicleTelemetry } from "../../store/telemetry/vehicleTelemetryStore";

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
