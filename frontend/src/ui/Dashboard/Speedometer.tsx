import { memo, useMemo } from "react";
import { GaugeDisc, Hub, Needle, ScaleMarks } from "./Gauge";
import { arcPath, linearTicks, MPH_TO_KPH, SPEED_MAX_KPH, SPEED_START, SPEED_SWEEP } from "./gaugeGeometry";
import { SpeedometerLights } from "./InstrumentLights";

const SpeedFace = memo(function SpeedFace({maxKph}:{maxKph:number}) {
  const [mphTicks,kphTicks]=useMemo(()=>{
    const angle=(kph:number)=>SPEED_START+kph/maxKph*SPEED_SWEEP;
    const mphMax=Math.floor(maxKph/MPH_TO_KPH/5)*5;
    return [linearTicks(mphMax,5,maxKph<=160?10:20,value=>angle(value*MPH_TO_KPH)),linearTicks(maxKph,5,20,angle)];
  },[maxKph]);
  return <g className="speedometer-face">
    <GaugeDisc />
    <g data-scale="mph"><ScaleMarks ticks={mphTicks} radius={93} labelRadius={77} /></g>
    <g data-scale="kmh">
      <path d={arcPath(100, 100, 64, SPEED_START, SPEED_START + SPEED_SWEEP)} fill="none" stroke="#8f9aa6" strokeWidth=".5" />
      <ScaleMarks ticks={kphTicks} radius={64} labelRadius={53} small />
    </g>
    <text x="95" y="56" className="gauge-caption">MPH</text>
    <text x="95" y="70" className="gauge-caption gauge-unit-inner">km/h</text>
  </g>;
});

export default memo(function Speedometer({ speedKph, maxKph=SPEED_MAX_KPH, unit, clusterMask, clusterFields }: { maxKph?:number; speedKph: number | null; unit: "MPH" | "KM/H"; clusterMask: number | null; clusterFields: number }) {
  const value = speedKph === null ? null : unit === "MPH" ? speedKph / MPH_TO_KPH : speedKph;
  const faceMax=Math.max(80,Math.ceil(maxKph/20)*20);
  const max = unit === "MPH" ? faceMax/MPH_TO_KPH : faceMax;
  return <div className="speedometer-wrapper" role="meter" aria-label="Speed" aria-valuemin={0} aria-valuemax={max}
    aria-valuenow={value === null ? undefined : Math.min(max, value)} aria-valuetext={value === null ? "Unavailable" : `${Math.round(value)} ${unit}`}>
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <SpeedFace maxKph={faceMax} />
      <Needle angle={SPEED_START+Math.max(0,Math.min(faceMax,speedKph??0))/faceMax*SPEED_SWEEP} visible={speedKph !== null} x={100} y={100} length={90} /><Hub x={100} y={100} />
    </svg>
    <SpeedometerLights mask={clusterMask} fields={clusterFields} />
  </div>;
});
