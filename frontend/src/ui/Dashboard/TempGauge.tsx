import { memo } from "react";
import { Hub, Needle } from "./Gauge";
import { arcPath } from "./gaugeGeometry";

const TempFace = memo(function TempFace({ min, overheat, critical }: { min: number; overheat: number; critical: number }) {
  const warningAngle = (1 - (overheat - min) / (critical - min)) * Math.PI / 2;
  return <g className="temperature-face">
    <path d={arcPath(100, 133, 62, 0, Math.PI / 2)} fill="none" stroke="#dce6ef" strokeWidth="1" />
    <path d={arcPath(100, 133, 59, 0, warningAngle)} fill="none" stroke="#b91c35" strokeWidth="5" />
    {[0, 1, 2, 3, 4].map(i => { const a = i / 4 * Math.PI / 2; return <line key={i} x1={100 + 54 * Math.cos(a)} y1={133 + 54 * Math.sin(a)} x2={100 + 62 * Math.cos(a)} y2={133 + 62 * Math.sin(a)} stroke="#dce6ef" strokeWidth={i % 2 === 0 ? 2 : 1} />; })}
    <text x="149" y="135">H</text><text x="100" y="180">C</text>
    <image href="/images/engine-coolant.svg" x="135" y="157" width="13" height="13" className="gauge-symbol" />
  </g>;
});

export default memo(function TempGauge({ temp, min, overheat, critical }: { temp: number | null; min: number; overheat: number; critical: number }) {
  const ratio = temp === null ? null : Math.max(0, Math.min(1, (temp - min) / (critical - min)));
  return <g role="meter" aria-label="Coolant temperature" aria-valuemin={min} aria-valuemax={critical} aria-valuenow={temp === null ? undefined : Math.max(min, Math.min(critical, temp))}
    aria-valuetext={temp === null ? "Unavailable" : `${temp.toFixed(1)} degrees Celsius`}>
    <TempFace min={min} overheat={overheat} critical={critical} />
    <Needle angle={(1 - (ratio ?? 0)) * Math.PI / 2} visible={ratio !== null} x={100} y={133} length={58} /><Hub x={100} y={133} />
  </g>;
});
