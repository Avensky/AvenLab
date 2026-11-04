import { useEffect } from 'react';
import { AttackIcon } from './AttackIcon';
import { UltimateChargeArc } from './UltimateChargeArc';
import { useNetworkStore } from '../store/session/networkStore';
import { startVehicleTelemetry, useVehicleTelemetryStore } from '../store/telemetry/vehicleTelemetryStore';
import { barrageReady, requestTankBarrage } from './tankBarrage';

function BarrageDial() {
  // Both layouts use the same sampled, freshness-checked charge as the portrait.
  useEffect(startVehicleTelemetry, []);
  const charge = useVehicleTelemetryStore(s => s.data.ultimateFraction);
  return <span className="cooldown-clock" data-ready={charge === 1}
    aria-label={charge === null ? 'Ultimate charge unavailable' : `Ultimate charge ${Math.round(charge * 100)}%`}>
    <UltimateChargeArc shape="dial" fraction={charge} />
    <AttackIcon kind="cannon"/>
  </span>;
}

export function BarrageTrigger({tile=false}:{tile?:boolean}={}){
  const ready=useNetworkStore(barrageReady);
  const seconds=useNetworkStore(s=>Math.ceil((s.getMe()?.barrage?.ticks_left??0)/60));
  return <button type="button" className={tile?'barrage-action':'barrage-trigger'} disabled={!ready} aria-label="Activate Barrage Ultimate"
    title={seconds?`Barrage active · ${seconds}s`:'Barrage · 5 seconds · 45 m · requires full Ultimate charge'} onClick={()=>void requestTankBarrage()}>
    {tile && <><BarrageDial/><span>BARRAGE</span></>}
    {seconds>0 && <span className="barrage-time">{seconds}s</span>}
  </button>;
}
