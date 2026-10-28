import { memo, useMemo } from "react";
import { GaugeDisc, Hub, Needle, ScaleMarks } from "./Gauge";
import { arcPath, linearTicks } from "./gaugeGeometry";
import type { DisplayPower } from "./dashboardModel";
import { RpmLights } from "./InstrumentLights";

const start = 3 * Math.PI / 4, end = 2 * Math.PI - Math.PI / 36;
const RpmFace = memo(function RpmFace({ max, redline }: { max: number; redline: number }) {
  const ticks = useMemo(() => linearTicks(max / 1000, .25, 1, value => start + value * 1000 / max * (end - start)), [max]);
  return <g className="revolutions-face">
    <GaugeDisc />
    <path d={arcPath(100, 100, 77, start - .13, end + .13)} stroke="#f1f0e8" strokeWidth="36" fill="none" />
    <path d={arcPath(100, 100, 90, start + Math.min(1, redline / max) * (end - start), end)} stroke="#bb2927" strokeWidth="7" fill="none" />
    <ScaleMarks ticks={ticks} radius={94} labelRadius={74} dark redline={redline / 1000} />
    <text x="95" y="48" className="gauge-rpm-unit">×1000 r/min</text>
  </g>;
});

const DigitalReadouts = memo(function DigitalReadouts({ gear, speed, unit, power, park }: {
  gear: number | null; speed: number | null; unit: "MPH" | "KM/H"; power: DisplayPower; park: boolean;
}) {
  const lit = power === "running" || power === "cranking";
  return <g className="gauge-displays" data-power={power}>
    <rect x="78" y="133" width="35" height="20" rx="1" className="gauge-lcd-recess" />
    <rect x="117" y="133" width="60" height="20" rx="1" className="gauge-lcd-recess" />
    <g className="gauge-lcd-illumination">
      <g className="gauge-lcd" data-readout="gear">
        <rect x="78" y="133" width="35" height="20" rx="1" />
        <text x="91" y="144" className="gauge-lcd-label">{lit ? "GEAR" : ""}</text>
        <text x="106" y="144">{!lit ? "" : park ? "P" : gear === null ? "—" : gear === -1 ? "R" : gear === 0 ? "N" : gear}</text>
      </g>
      <g className="gauge-lcd" data-readout="speed">
        <rect x="117" y="133" width="60" height="20" rx="1" />
        <text x="138" y="144">{!lit ? "" : speed === null ? "—" : Math.round(speed)}</text>
        <text x="163" y="145" className="gauge-lcd-label">{lit ? unit : ""}</text>
      </g>
    </g>
  </g>;
});

export default memo(function Revolutions({ rpm, gear, maxRpm, redlineRpm, speed, unit, power, vehicleMask, clusterMask, park }: {
  rpm: number | null; gear: number | null; maxRpm: number; redlineRpm: number; speed: number | null;
  unit: "MPH" | "KM/H"; power: DisplayPower; vehicleMask: number; clusterMask: number | null; park: boolean;
}) {
  const max = Math.max(9000, Math.ceil(maxRpm / 1000) * 1000);
  const ratio = Math.max(0, Math.min(1, (rpm ?? 0) / max));
  return <div className="revolutions-wrapper" role="meter" aria-label="Engine RPM" aria-valuemin={0} aria-valuemax={max}
    aria-valuenow={rpm ?? undefined} aria-valuetext={rpm === null ? "Unavailable" : `${rpm} RPM`}>
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <RpmFace max={max} redline={redlineRpm} />
      <DigitalReadouts gear={gear} speed={speed} unit={unit} power={power} park={park} />
      <Needle angle={start + ratio * (end - start)} visible={rpm !== null} x={100} y={100} length={87} /><Hub x={100} y={100} />
    </svg>
    <RpmLights vehicleMask={vehicleMask} clusterMask={clusterMask} />
  </div>;
});
