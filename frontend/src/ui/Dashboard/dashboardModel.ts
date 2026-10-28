import { ResourceFlags } from "../../store/tools/resourceMasks";
import type { VehicleTelemetry } from "../../store/vehicleTelemetryStore";

export type DisplayPower = "off" | "cranking" | "running" | "unavailable";
export function displayPower(data: Pick<VehicleTelemetry, "signal" | "engineOn" | "resourceMask">): DisplayPower {
  if (data.signal !== "live") return "unavailable";
  if (data.resourceMask & ResourceFlags.STARTING) return "cranking";
  return data.engineOn ? "running" : "off";
}
