import { create } from "zustand";

// Availability describes simulated readings, not requested input. Older Rust
// builds publish zero placeholders; absent bits must never mean an empty tank.
export const TelemetryFields = {
  RPM: 1 << 0,
  GEAR: 1 << 1,
  FUEL: 1 << 2,
  TEMPERATURE: 1 << 3,
  BOOST: 1 << 4,
  CONDITION: 1 << 5,
  ULTIMATE: 1 << 6,
} as const;
export type GaugeConfig = {
  cockpitControls: boolean;
  cockpitVersion: number;
  clusterFields: number;
  ambientTempC: number | null;
  speedMaxKph: number;
  maxRpm: number;
  redlineRpm: number;
  fuelCapacityLiters: number | null;
  minTempC: number;
  overheatC: number;
  criticalC: number;
  telemetryMask: number;
};
export const DEFAULT_GAUGE_CONFIG: GaugeConfig = {
  cockpitControls: false,
  cockpitVersion: 0,
  clusterFields: 0,
  ambientTempC: null,
  speedMaxKph: 240,
  maxRpm: 9000,
  redlineRpm: 7500,
  fuelCapacityLiters: null,
  minTempC: 40,
  overheatC: 110,
  criticalC: 130,
  telemetryMask: 0,
};
export function parseGaugeConfig(value: unknown): GaugeConfig | null {
  if (!value || typeof value !== "object") return null;
  const config = value as Record<string, unknown>;
  if (
    typeof config.max_speed !== "number" ||
    !Number.isFinite(config.max_speed) ||
    config.max_speed <= 0
  )
    return null;
  const hud =
    config.hud && typeof config.hud === "object"
      ? (config.hud as Record<string, unknown>)
      : {};
  const number = (key: string, fallback: number, min: number, max: number) =>
    typeof hud[key] === "number" && Number.isFinite(hud[key])
      ? Math.max(min, Math.min(max, hud[key] as number))
      : fallback;
  const maxRpm = number("max_rpm", 9000, 1000, 20000);
  const minTempC = number("min_temp_c", 40, -50, 100);
  const overheatC = number("overheat_c", 110, minTempC + 1, 250);
  return {
    cockpitControls: hud.cockpit_controls === true,
    cockpitVersion:
      hud.cockpit_controls === true ? number("cockpit_version", 1, 1, 7) : 0,
    ambientTempC:
      typeof hud.ambient_temp_c === "number" &&
      Number.isFinite(hud.ambient_temp_c) &&
      hud.ambient_temp_c >= -80 &&
      hud.ambient_temp_c <= 80
        ? hud.ambient_temp_c
        : null,
    clusterFields:
      typeof hud.cluster_fields === "number" &&
      Number.isInteger(hud.cluster_fields) &&
      hud.cluster_fields >= 0 &&
      hud.cluster_fields <= 0xffff
        ? hud.cluster_fields & 8191
        : 0,
    // Rust max_speed is m/s. Round the face to readable 40 km/h major bands.
    speedMaxKph: Math.max(
      80,
      Math.min(800, Math.ceil((config.max_speed * 3.6) / 40) * 40),
    ),
    maxRpm,
    redlineRpm: number("redline_rpm", Math.min(7500, maxRpm), 0, maxRpm),
    fuelCapacityLiters:
      typeof hud.fuel_capacity_liters === "number" &&
      Number.isFinite(hud.fuel_capacity_liters) &&
      hud.fuel_capacity_liters > 0
        ? Math.min(hud.fuel_capacity_liters, 10000)
        : null,
    minTempC,
    overheatC,
    criticalC: number(
      "critical_c",
      Math.max(130, overheatC + 1),
      overheatC + 1,
      300,
    ),
    telemetryMask:
      typeof hud.telemetry_mask === "number" &&
      Number.isSafeInteger(hud.telemetry_mask) &&
      hud.telemetry_mask >= 0
        ? hud.telemetry_mask & 127
        : 0,
  };
}
export const useVehicleConfigStore = create<{
  byPlayer: Record<string, GaugeConfig>;
  receive: (playerId: unknown, config: unknown) => void;
  reset: () => void;
}>((set) => ({
  byPlayer: {},
  receive: (playerId, config) => {
    const gauges = parseGaugeConfig(config);
    if (typeof playerId !== "string" || !playerId || !gauges) return;
    set((state) => ({ byPlayer: { ...state.byPlayer, [playerId]: gauges } }));
  },
  reset: () => set({ byPlayer: {} }),
}));
