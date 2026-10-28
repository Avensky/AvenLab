import { create } from "zustand";
import { useNetworkStore, type PhysicsEntitySnapshot } from "./networkStore";
import { DEFAULT_GAUGE_CONFIG, TelemetryFields, useVehicleConfigStore, type GaugeConfig } from "./vehicleConfigStore";
import { VehicleFlags, hasFlag } from "./tools/inputMasks";
import { CLUSTER_KNOWN_MASK } from "./tools/clusterMasks";

export const HUD_UPDATE_HZ = 20;
export const HUD_STALE_MS = 500;
export type VehicleTelemetry = {
  signal: "live" | "waiting" | "stale" | "offline"; vehicleId: string;
  speedKph: number | null; rpm: number | null; gear: number | null; fuelLiters: number | null;
  tempC: number | null; boostFraction: number | null; engineOn: boolean; boostActive: boolean;
  conditionFraction: number | null; resourceMask: number; absEnabled: boolean; tcsEnabled: boolean;
  ultimateFraction: number | null;
  vehicleMask: number; clusterMask: number | null;
  cockpitMask: number | null;
  cabinMask: number | null; cruiseTargetKph: number | null;
  positionX:number|null; positionZ:number|null; yawDeg:number|null;
  config: GaugeConfig;
};
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const rounded = (value: number, step: number) => Math.round(value / step) * step;
export function projectVehicleTelemetry(entity: PhysicsEntitySnapshot | null | undefined, connected: boolean,
  receivedMs: number | undefined, now: number, config = DEFAULT_GAUGE_CONFIG): VehicleTelemetry {
  const signal = !connected ? "offline" : !entity ? "waiting" : receivedMs === undefined || now - receivedMs > HUD_STALE_MS || now < receivedMs ? "stale" : "live";
  const valid = signal === "live";
  const advertised = entity?.telemetry_mask;
  const mask = advertised === undefined ? config.telemetryMask : Number.isSafeInteger(advertised) && advertised >= 0 ? advertised & 127 : 0;
  const reading = (field: number, value: unknown, step: number, min: number, max: number) => valid && hasFlag(mask, field) && finite(value)
    ? rounded(Math.max(min, Math.min(max, value)), step) : null;
  const vehicleMask = entity?.vehicle_mask ?? 0;
  return {
    positionX:valid&&finite(entity?.position?.[0])?rounded(entity.position[0],.1):null,
    positionZ:valid&&finite(entity?.position?.[2])?rounded(entity.position[2],.1):null,
    yawDeg:valid&&entity?.rotation?.length===4&&entity.rotation.every(finite)?rounded(Math.atan2(2*(entity.rotation[3]*entity.rotation[1]+entity.rotation[0]*entity.rotation[2]),1-2*(entity.rotation[1]**2+entity.rotation[2]**2))*180/Math.PI,.5):null,
    signal, vehicleId: entity?.vehicle_id?.toUpperCase() ?? "VEHICLE",
    vehicleMask: valid ? vehicleMask : 0,
    cockpitMask: valid && Number.isSafeInteger(entity?.cockpit_mask) && entity!.cockpit_mask! >= 0 && entity!.cockpit_mask! <= 0xffffffff ? entity!.cockpit_mask! : null,
    cabinMask: valid && config.cockpitVersion >= 3 && Number.isSafeInteger(entity?.cabin_mask) && entity!.cabin_mask! >= 0 && entity!.cabin_mask! <= 0xfffff ? entity!.cabin_mask! : null,
    cruiseTargetKph: valid && config.cockpitVersion >= 3 && finite(entity?.cruise_target_kph) ? rounded(Math.max(0,Math.min(200,entity.cruise_target_kph)),.1) : null,
    clusterMask: valid && Number.isSafeInteger(entity?.cluster_mask) && entity!.cluster_mask! >= 0 && entity!.cluster_mask! <= 0xffff
      ? entity!.cluster_mask! & CLUSTER_KNOWN_MASK : null,
    speedKph: valid && finite(entity?.speed) ? rounded(Math.abs(entity.speed) * 3.6, 0.1) : null,
    rpm: reading(TelemetryFields.RPM, entity?.rpm, 25, 0, config.maxRpm),
    gear: valid && hasFlag(mask, TelemetryFields.GEAR) && Number.isInteger(entity?.gear) && entity!.gear >= -1 && entity!.gear <= 20 ? entity!.gear : null,
    fuelLiters: config.fuelCapacityLiters === null ? null : reading(TelemetryFields.FUEL, entity?.fuel, 0.01, 0, config.fuelCapacityLiters),
    tempC: reading(TelemetryFields.TEMPERATURE, entity?.temp, 0.1, -50, 300),
    boostFraction: reading(TelemetryFields.BOOST, entity?.boost_fraction, 0.01, 0, 1),
    conditionFraction: reading(TelemetryFields.CONDITION, entity?.condition, 0.01, 0, 1),
    ultimateFraction: reading(TelemetryFields.ULTIMATE, entity?.ultimate_fraction, 0.01, 0, 1),
    resourceMask: valid && Number.isSafeInteger(entity?.resource_mask) && entity!.resource_mask! >= 0 && entity!.resource_mask! <= 0xffff ? entity!.resource_mask! : 0,
    absEnabled: valid && hasFlag(vehicleMask, VehicleFlags.ABS), tcsEnabled: valid && hasFlag(vehicleMask, VehicleFlags.TCS),
    engineOn: valid && hasFlag(vehicleMask, VehicleFlags.ENGINE_ON),
    boostActive: valid && hasFlag(mask, TelemetryFields.BOOST) && hasFlag(vehicleMask, VehicleFlags.BOOST), config,
  };
}
export const useVehicleTelemetryStore = create<{ data: VehicleTelemetry }>(() => ({ data: projectVehicleTelemetry(null, false, undefined, 0) }));
export function updateVehicleTelemetry(now = performance.now()) {
  const network = useNetworkStore.getState();
  const config = useVehicleConfigStore.getState().byPlayer[network.playerId] ?? DEFAULT_GAUGE_CONFIG;
  const data = projectVehicleTelemetry(network.getMe(), network.connected, network.snapshot?.received_at_ms, now, config);
  const previous = useVehicleTelemetryStore.getState().data;
  if ((Object.keys(data) as (keyof VehicleTelemetry)[]).some(key => !Object.is(data[key], previous[key]))) useVehicleTelemetryStore.setState({ data });
}

let owners = 0, timer: number | null = null;
function visibility() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  updateVehicleTelemetry();
  if (document.visibilityState !== "hidden") timer = window.setInterval(updateVehicleTelemetry, 1000 / HUD_UPDATE_HZ);
}
// One display sampler, mounted only with the driving HUD. Physics/networking
// continue at their original rates; static menus never subscribe to this store.
export function startVehicleTelemetry() {
  if (++owners === 1) { visibility(); document.addEventListener("visibilitychange", visibility); }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (--owners === 0) {
      if (timer !== null) window.clearInterval(timer);
      timer = null; document.removeEventListener("visibilitychange", visibility);
    }
  };
}
