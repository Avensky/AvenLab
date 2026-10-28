import { useEffect, useRef } from "react";
import { useInputStore } from "../../store/inputStore";
import { useVehicleTelemetryStore } from "../../store/vehicleTelemetryStore";
import { unpackCockpit } from "../../store/tools/cockpitMasks";
import { VehicleFlags, hasFlag } from "../../store/tools/inputMasks";

function requestAssist(assist: number, traction: boolean) {
  useInputStore.getState().setAssist(assist, traction);
}

// The same switches live in the optional drive dock and full cockpit. Indicators
// always follow confirmed telemetry; requests never paint a successful state.
export function DriveAssists({ compact = false }: { compact?: boolean }) {
  const live = useVehicleTelemetryStore(s => s.data.signal === "live");
  const supported = useVehicleTelemetryStore(s => s.data.config.cockpitVersion >= 2);
  const confirmedMask = useVehicleTelemetryStore(s => s.data.cockpitMask);
  const tcs = useVehicleTelemetryStore(s => s.data.tcsEnabled), abs = useVehicleTelemetryStore(s => s.data.absEnabled);
  const moving = useVehicleTelemetryStore(s => (s.data.speedKph ?? Infinity) > 1.8);
  const requestedMask = useInputStore(s => s.input.cockpit_mask);
  const requestedVehicle = useInputStore(s => s.input.vehicleMask);
  const confirmed = unpackCockpit(confirmedMask ?? undefined), requested = unpackCockpit(requestedMask ?? undefined);
  const pending = requestedMask !== undefined && requested.revision !== (confirmedMask === null ? -1 : confirmed.revision);
  const timer = useRef<number | null>(null), held = useRef<number | null>(null), consumed = useRef(false);
  const stop = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; held.current = null; };
  useEffect(() => {
    const clear = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; held.current = null; consumed.current = false; };
    const hidden = () => { if (document.visibilityState === "hidden") clear(); };
    window.addEventListener("blur", clear); document.addEventListener("visibilitychange", hidden);
    return () => { clear(); window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", hidden); };
  }, []);
  const fullOff = () => requestAssist(3, false);
  const toggleTrac = () => requestAssist(confirmed.assist === 1 ? 1 : tcs ? 2 : 0, !tcs);
  return <div className={`drive-assists${compact ? " drive-assists-compact" : " factory-assists"}`} role="group" aria-label="Driving assists"
    onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') event.stopPropagation(); }} onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') event.stopPropagation(); }}>
    <button type="button" aria-label="Toggle ABS" disabled={!live} aria-pressed={abs} aria-busy={live && hasFlag(requestedVehicle, VehicleFlags.ABS) !== abs}
      onClick={() => useInputStore.getState().toggleVehicleFlag(VehicleFlags.ABS)}>ABS<span>{abs ? "ON" : "OFF"}</span></button>
    <button type="button" aria-label="Toggle TCS" title="TRAC OFF · tap to toggle; hold 3 seconds while stopped for TRAC + VSC OFF"
      disabled={!live || !supported} aria-pressed={tcs} aria-busy={pending} data-off={!tcs}
      onPointerDown={event => { if (event.button !== 0 || held.current !== null) return; consumed.current = false; held.current = event.pointerId;
        if (!moving) timer.current = window.setTimeout(() => {
          timer.current = null; const data = useVehicleTelemetryStore.getState().data;
          if (document.visibilityState !== 'hidden' && data.signal === 'live' && (data.speedKph ?? Infinity) <= 1.8) { consumed.current = true; fullOff(); }
        }, 3100); }}
      onPointerUp={event => { if (held.current === event.pointerId) stop(); }} onPointerCancel={() => { stop(); consumed.current = false; }} onPointerLeave={() => { stop(); consumed.current = false; }}
      onClick={() => { if (consumed.current) { consumed.current = false; return; } toggleTrac(); }}>
      <img src="/images/traction-control.svg" alt="" /><span>TRAC<br />{tcs ? "ON" : "OFF"}</span></button>
    <button type="button" aria-label="VSC Sport" disabled={!live || !supported} aria-pressed={confirmed.assist === 1} aria-busy={pending}
      onClick={() => requestAssist(confirmed.assist === 1 ? (tcs ? 0 : 2) : 1, tcs)}>VSC<span>SPORT</span></button>
    {!compact && <><button type="button" aria-label="TRAC and VSC off" disabled={!live || !supported || moving} aria-pressed={confirmed.assist === 3}
      onClick={fullOff}>TRAC + VSC<span>OFF · STOPPED</span></button>
      <small>{confirmed.assist === 3 ? "TRAC + VSC OFF" : confirmed.assist === 1 ? `VSC SPORT · TRAC ${tcs ? "ON" : "OFF"}` : `NORMAL · TRAC ${tcs ? "ON" : "OFF"}`}</small></>}
  </div>;
}
