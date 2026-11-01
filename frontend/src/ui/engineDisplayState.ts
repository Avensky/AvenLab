import { ResourceFlags } from "../store/telemetry/resourceMasks.ts";
import type { VehicleTelemetry } from "../store/telemetry/vehicleTelemetryStore";

/** Confirmed running wins over a trailing STARTING bit, for both key and dash. */
export function engineDisplayState(
  data: Pick<VehicleTelemetry, "signal" | "engineOn" | "resourceMask">,
) {
  if (data.signal !== "live") return "unavailable";
  if (data.engineOn) return "running";
  return data.resourceMask & ResourceFlags.STARTING ? "cranking" : "off";
}

/** One clock phase for CSS pulses; only called when the power state changes. */
export function syncStarterPulse(
  element: HTMLElement | null,
  now = performance.now(),
) {
  element?.style.setProperty("--starter-period", "230ms");
  element?.style.setProperty("--starter-phase", `${-(now % 230)}ms`);
}
