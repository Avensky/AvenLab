import { memo, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { HeroPortrait } from '../../game/alpha/HeroPortrait';
import { useNetworkStore } from '../../store/session/networkStore';
import { usePreferencesStore } from '../../store/preferences/preferencesStore';
import { showVehicleHealthBar } from '../../store/preferences/healthVisibility';
import { startVehicleTelemetry, useVehicleTelemetryStore } from '../../store/telemetry/vehicleTelemetryStore';
import { combatHealth, resourceReadings } from './resourceModel';
import './futuristicHUD.css';

const percent = (value: number | null) => value === null ? '—' : `${Math.round(value * 100)}%`;
const ResourceBar = memo(function ResourceBar({ label, value, text, kind }: {
  label: string; value: number | null; text?: string; kind: string;
}) {
  return <div className="future-resource" data-kind={kind} data-low={value !== null && value <= .2} data-available={value !== null}>
    <span>{label}</span>
    <div className="future-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === null ? undefined : Math.round(value * 100)} aria-valuetext={text ?? percent(value)}><i style={{width: `${(value ?? 0) * 100}%`}} /></div>
    <output>{text ?? percent(value)}</output>
  </div>;
});

/** A second instrument set, using the same shared sampler as the classic dials.
 * No extra input bindings, physics writes or fabricated weapon-heat meter. */
export function FuturisticHUD() {
  useEffect(startVehicleTelemetry, []);
  const data = useVehicleTelemetryStore(useShallow(s => ({signal: s.data.signal, vehicleId: s.data.vehicleId, speedKph: s.data.speedKph, gear: s.data.gear, rpm: s.data.rpm, cockpitMask: s.data.cockpitMask, fuelLiters: s.data.fuelLiters, boostFraction: s.data.boostFraction, conditionFraction: s.data.conditionFraction, ultimateFraction: s.data.ultimateFraction, tempC: s.data.tempC, config: s.data.config})));
  const me = useNetworkStore(useShallow(s => {
    const entity = s.connected ? s.getMe() : undefined;
    const health = combatHealth(entity);
    return {hero: entity?.vehicle_id ?? null, appearance: entity?.appearance, team: entity?.team, hp: health?.hp ?? null, max: health?.max ?? null, defeated: health?.defeated ?? false, protection: health?.protection ?? 0};
  }));
  const mode = usePreferencesStore(s => s.healthBars), units = usePreferencesStore(s => s.speedUnit);
  // Only these readings are consumed; resourceReadings deliberately needs no pose.
  const readings = resourceReadings(data);
  const health = data.signal === 'live' && me.hp !== null && me.max !== null ? {hp: me.hp, max: me.max, defeated: me.defeated, protection: me.protection} : null;
  const showHP = showVehicleHealthBar(mode, me.team, true);
  const park = data.signal === 'live' && data.cockpitMask !== null && Boolean(data.cockpitMask & 64) && ((data.cockpitMask >>> 7) & 15) === 8;
  const speed = readings.speed === null ? '—' : Math.round(readings.speed / (units === 'mph' ? 1.609344 : 1));
  return <section className="futuristic-hud" aria-label="Futuristic vehicle instruments" data-signal={data.signal} data-defeated={health?.defeated ?? false}>
    <div className="future-identity">
      <HeroPortrait hero={me.hero} appearance={me.appearance} />
      <strong>{data.vehicleId}</strong>
    </div>
    <div className="future-resources">
      {showHP && <ResourceBar label="HULL HP" kind="health" value={health ? health.hp / health.max : null} text={health ? `${Math.ceil(health.hp)} / ${Math.ceil(health.max)}` : '—'} />}
      <ResourceBar label="FUEL" kind="fuel" value={readings.fuel} />
      <ResourceBar label="NITROUS" kind="nitrous" value={readings.nitrous} />
      <div className="future-condition"><span>CONDITION {percent(readings.condition)}</span><span data-hot={readings.temperature !== null && readings.temperature >= data.config.overheatC}>ENGINE {readings.temperature === null ? '—' : `${Math.round(readings.temperature)}°C`}</span><span>RPM {readings.rpm === null ? '—' : Math.round(readings.rpm)}</span></div>
    </div>
    <div className="future-driving"><strong>{speed}</strong><small>{units === 'mph' ? 'MPH' : 'KM/H'}</small><span>GEAR <b>{readings.gear === null ? '—' : park ? 'P' : readings.gear === -1 ? 'R' : readings.gear === 0 ? 'N' : readings.gear}</b></span></div>
    <div className="future-ultimate" role="meter" aria-label="Ultimate charge" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readings.ultimate === null ? undefined : Math.round(readings.ultimate * 100)} aria-valuetext={percent(readings.ultimate)} data-ready={readings.ultimate === 1}>
      <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27"/><circle className="future-ultimate-fill" cx="32" cy="32" r="27" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - (readings.ultimate ?? 0) * 100}/></svg>
      <strong>{percent(readings.ultimate)}</strong><small>ULTIMATE</small>
    </div>
    <div className="future-status" role="status">{data.signal !== 'live' ? data.signal.toUpperCase() : health?.defeated ? 'VEHICLE DISABLED' : health && health.protection > 0 ? `SPAWN PROTECTION ${health.protection.toFixed(1)}s` : ''}</div>
  </section>;
}
