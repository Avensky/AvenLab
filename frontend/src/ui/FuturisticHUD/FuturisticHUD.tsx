import {BarrageTrigger} from "../../combat/BarrageTrigger";
import { DrivingIgnition } from '../Cockpit/DrivingIgnition';
import { DriveAssists } from '../Cockpit/DriveAssists';
import { HudGroup } from '../HudGroup';
import { memo, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { HeroPortrait } from '../../game/alpha/HeroPortrait';
import { useNetworkStore } from '../../store/session/networkStore';
import { usePreferencesStore } from '../../store/preferences/preferencesStore';
import { showVehicleHealthBar } from '../../store/preferences/healthVisibility';
import { startVehicleTelemetry, useVehicleTelemetryStore } from '../../store/telemetry/vehicleTelemetryStore';
import { combatHealth, resourceReadings, engineHeatBand } from './resourceModel';
import './futuristicHUD.css';

const chargePerimeter = 'M50 3H91L97 9V91L91 97H9L3 91V9L9 3Z';
const percent = (value: number | null) => value === null ? '—' : `${Math.round(value * 100)}%`;
const ResourceBar = memo(function ResourceBar({ label, value, text, kind }: {
  label: string; value: number | null; text?: string; kind: string;
}) {
  return <div className="future-resource" data-kind={kind} data-low={value !== null && value <= .2} data-available={value !== null}>
    <div className="future-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === null ? undefined : Math.round(value * 100)} aria-valuetext={text ?? percent(value)}><i style={{width: `${(value ?? 0) * 100}%`}} />
      <span className="future-readout"><b>{kind === 'health' ? 'HP' : label}</b><output>{text ?? percent(value)}</output></span>
    </div>
  </div>;
});

/** A second instrument set, using the same shared sampler as the classic dials.
 * No extra input bindings, physics writes or fabricated weapon-heat meter. */
export function FuturisticHUD() {
  useEffect(startVehicleTelemetry, []);
  const data = useVehicleTelemetryStore(useShallow(s => ({signal: s.data.signal, vehicleId: s.data.vehicleId, speedKph: s.data.speedKph, gear: s.data.gear, cockpitMask: s.data.cockpitMask, fuelLiters: s.data.fuelLiters, boostFraction: s.data.boostFraction, ultimateFraction: s.data.ultimateFraction, tempC: s.data.tempC, config: s.data.config})));
  const me = useNetworkStore(useShallow(s => {
    const entity = s.connected ? s.getMe() : undefined;
    const health = combatHealth(entity);
    return {hero: entity?.vehicle_id ?? null, appearance: entity?.appearance, team: entity?.team, hp: health?.hp ?? null, max: health?.max ?? null, defeated: health?.defeated ?? false, protection: health?.protection ?? 0};
  }));
  const mode = usePreferencesStore(s => s.healthBars), units = usePreferencesStore(s => s.speedUnit);
  // Only these readings are consumed; resourceReadings deliberately needs no pose.
  const readings = resourceReadings(data);
  const charge = readings.ultimate;
  const chargeText = percent(charge);
  const heat = engineHeatBand(readings.temperature, data.config);
  const health = data.signal === 'live' && me.hp !== null && me.max !== null ? {hp: me.hp, max: me.max, defeated: me.defeated, protection: me.protection} : null;
  const showHP = showVehicleHealthBar(mode, me.team, true);
  const park = data.signal === 'live' && data.cockpitMask !== null && Boolean(data.cockpitMask & 64) && ((data.cockpitMask >>> 7) & 15) === 8;
  const speed = readings.speed === null ? '—' : Math.round(readings.speed / (units === 'mph' ? 1.609344 : 1));
  return <section className="futuristic-hud" aria-label="Futuristic vehicle instruments" data-signal={data.signal} data-defeated={health?.defeated ?? false}>
    <div className="future-identity" data-charged={charge===1}>
      <HeroPortrait hero={me.hero} appearance={me.appearance} cacheOnly showStyleStatus={false} />
      {me.hero==="tank" && <BarrageTrigger/>}
      <div className="ultimate-gauge" role="meter" aria-label="Ultimate charge" title="Ultimate charge"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={charge===null?undefined:Math.round(charge*100)}
        aria-valuetext={chargeText}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <path className="charge-track" d={chargePerimeter}/>
          <path className="charge-outer" d={chargePerimeter} pathLength="1"
            strokeDasharray="1" strokeDashoffset={1-(charge??0)} />
          <path className="charge-inner" d="M50 7H11L7 11V89L11 93H89L93 89V11L89 7Z" pathLength="1"
            strokeDasharray="1" strokeDashoffset={1-(charge??0)} />
        </svg>
        <strong>{chargeText}</strong>
      </div>
    </div>
    <div className="future-resources">
      {showHP && <ResourceBar label="HULL HP" kind="health" value={health ? health.hp / health.max : null} text={health ? `${Math.ceil(health.hp)} / ${Math.ceil(health.max)}` : '—'} />}
      <div className="future-fuel-row">
        <ResourceBar label="FUEL" kind="fuel" value={readings.fuel} />
        <span className="future-engine" data-heat={heat}
          title={`Engine temperature · ${heat}`}>
          <abbr title="Engine temperature">ENG</abbr> <b>{readings.temperature === null ? '—' : `${Math.round(readings.temperature * 9 / 5 + 32)}°F`}</b>
        </span>
      </div>
      <ResourceBar label="NITROUS" kind="nitrous" value={readings.nitrous} />
    </div>
    <HudGroup id="assists" title="Driving assists" className="future-assists"><DriveAssists compact instrument /></HudGroup>
    <div className="future-driving"><strong>{speed}</strong><small>{units === 'mph' ? 'MPH' : 'KM/H'}</small><span>GEAR <b>{readings.gear === null ? '—' : park ? 'P' : readings.gear === -1 ? 'R' : readings.gear === 0 ? 'N' : readings.gear}</b></span></div>
    <DrivingIgnition />
    <div className="future-status" role="status">{data.signal !== 'live' ? data.signal.toUpperCase() : health?.defeated ? 'VEHICLE DISABLED' : health && health.protection > 0 ? `SPAWN PROTECTION ${health.protection.toFixed(1)}s` : ''}</div>
  </section>;
}
