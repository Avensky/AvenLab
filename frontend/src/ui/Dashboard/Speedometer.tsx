import { memo } from "react";
import { GaugeDisc, Hub, Needle, ScaleMarks } from "./Gauge";
import { arcPath, KPH_TICKS, MPH_TICKS, MPH_TO_KPH, SPEED_MAX_KPH, SPEED_MAX_MPH, SPEED_START, SPEED_SWEEP, speedAngle } from "./gaugeGeometry";
import { SpeedometerLights } from "./InstrumentLights";

const SpeedFace = memo(function SpeedFace() {
  return <g className="speedometer-face">
    <GaugeDisc />
    <g data-scale="mph"><ScaleMarks ticks={MPH_TICKS} radius={93} labelRadius={77} /></g>
    <g data-scale="kmh">
      <path d={arcPath(100, 100, 64, SPEED_START, SPEED_START + SPEED_SWEEP)} fill="none" stroke="#8f9aa6" strokeWidth=".5" />
      <ScaleMarks ticks={KPH_TICKS} radius={64} labelRadius={53} small />
    </g>
    <text x="95" y="56" className="gauge-caption">MPH</text>
    <text x="95" y="70" className="gauge-caption gauge-unit-inner">km/h</text>
  </g>;
});

export default memo(function Speedometer({ speedKph, unit, clusterMask, clusterFields }: { speedKph: number | null; unit: "MPH" | "KM/H"; clusterMask: number | null; clusterFields: number }) {
  const value = speedKph === null ? null : unit === "MPH" ? speedKph / MPH_TO_KPH : speedKph;
  const max = unit === "MPH" ? SPEED_MAX_MPH : SPEED_MAX_KPH;
  return <div className="speedometer-wrapper" role="meter" aria-label="Speed" aria-valuemin={0} aria-valuemax={max}
    aria-valuenow={value === null ? undefined : Math.min(max, value)} aria-valuetext={value === null ? "Unavailable" : `${Math.round(value)} ${unit}`}>
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <SpeedFace />
      <Needle angle={speedAngle(Math.max(0, Math.min(SPEED_MAX_KPH, speedKph ?? 0)))} visible={speedKph !== null} x={100} y={100} length={90} /><Hub x={100} y={100} />
    </svg>
    <SpeedometerLights mask={clusterMask} fields={clusterFields} />
  </div>;
});
