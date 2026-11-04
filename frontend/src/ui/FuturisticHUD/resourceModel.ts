import type { PhysicsEntitySnapshot } from '../../store/session/networkStore';
import type { VehicleTelemetry } from '../../store/telemetry/vehicleTelemetryStore';

export function fraction(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}
/** Missing/stale data stays unknown. Combat HP never falls back to condition. */
export function resourceReadings(data: Pick<VehicleTelemetry, "signal" | "config" | "fuelLiters" | "boostFraction" | "conditionFraction" | "ultimateFraction" | "speedKph" | "gear" | "tempC" | "rpm">) {
  const live = data.signal === 'live';
  const capacity = data.config.fuelCapacityLiters;
  return {
    fuel: live && data.fuelLiters !== null && capacity !== null && capacity > 0 ? fraction(data.fuelLiters / capacity) : null,
    nitrous: live ? fraction(data.boostFraction) : null,
    condition: live ? fraction(data.conditionFraction) : null,
    ultimate: live ? fraction(data.ultimateFraction) : null,
    speed: live && data.speedKph !== null && Number.isFinite(data.speedKph) ? Math.max(0, data.speedKph) : null,
    gear: live ? data.gear : null,
    rpm: live ? data.rpm : null,
    // Engine temperature is real telemetry; no weapon-heat channel exists yet.
    temperature: live ? data.tempC : null,
  };
}
export function combatHealth(entity: PhysicsEntitySnapshot | null | undefined) {
  const h = entity?.health;
  if (!h || !Number.isFinite(h.hp) || !Number.isFinite(h.max_hp) || h.max_hp <= 0 || typeof h.defeated !== 'boolean') return null;
  return {
    hp: Math.max(0, Math.min(h.max_hp, h.hp)), max: h.max_hp,
    defeated: h.defeated,
    protection: Number.isFinite(h.spawn_protection_s) ? Math.max(0, h.spawn_protection_s) : 0,
  };
}
