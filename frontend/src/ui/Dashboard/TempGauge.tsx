import { memo } from "react";
import { Hub, Needle } from "./Gauge";
import { arcPath } from "./gaugeGeometry";
import type { DisplayPower } from "./dashboardModel";

const TempFace = memo(function TempFace({ min, overheat, critical }: { min: number; overheat: number; critical: number }) {
  const warningAngle = (1 - (overheat - min) / (critical - min)) * Math.PI / 2;
  return <g className="temperature-face">
    <path d={arcPath(121, 121, 64, 0, Math.PI / 2)} fill="none" stroke="#dce6ef" strokeWidth="1" />
    <path d={arcPath(121, 121, 61, 0, warningAngle)} fill="none" stroke="#b91c35" strokeWidth="5" />
    {[0, 1, 2, 3, 4].map(i => { const a = i / 4 * Math.PI / 2; return <line key={i} x1={121 + 56 * Math.cos(a)} y1={121 + 56 * Math.sin(a)} x2={121 + 64 * Math.cos(a)} y2={121 + 64 * Math.sin(a)} stroke="#dce6ef" strokeWidth={i % 2 === 0 ? 2 : 1} />; })}
    <text x="178" y="113">H</text><text x="114" y="171">C</text>
    <image href="/images/engine-coolant.svg" x="156" y="146" width="12" height="14" className="gauge-symbol" />
  </g>;
});

export default memo(function TempGauge({ temp, min, overheat, critical, power }: { temp: number | null; min: number; overheat: number; critical: number; power: DisplayPower }) {
  const ratio = temp === null ? null : Math.max(0, Math.min(1, (temp - min) / (critical - min)));
  return <g role="meter" aria-label="Coolant temperature" aria-valuemin={min} aria-valuemax={critical} aria-valuenow={temp === null ? undefined : Math.max(min, Math.min(critical, temp))}
    aria-valuetext={temp === null ? "Unavailable" : `${temp.toFixed(1)} degrees Celsius${power === "off" ? " · engine off, needle centered" : ""}`} data-power={power}>
    <TempFace min={min} overheat={overheat} critical={critical} />
    <Needle angle={power === "off" ? Math.PI / 4 : (1 - (ratio ?? 0)) * Math.PI / 2} visible={ratio !== null} x={121} y={121} length={60} /><Hub x={121} y={121} />
  </g>;
});
