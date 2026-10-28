import { memo } from "react";
import { Needle } from "./Gauge";
import { arcPath } from "./gaugeGeometry";

export default memo(function TempGauge({ temp, min, overheat, critical }: { temp: number | null; min: number; overheat: number; critical: number }) {
  const ratio = temp === null ? null : Math.max(0, Math.min(1, (temp - min) / (critical - min)));
  const warningAngle = (1 - (overheat - min) / (critical - min)) * Math.PI / 2;
  return <g role="meter" aria-label="Coolant temperature" aria-valuemin={min} aria-valuemax={critical} aria-valuenow={temp === null ? undefined : Math.max(min, Math.min(critical, temp))}
    aria-valuetext={temp === null ? "Unavailable" : `${temp.toFixed(1)} degrees Celsius`}>
    <path d={arcPath(60, 80, 68, 0, Math.PI / 2)} fill="none" stroke="#dce6ef" strokeWidth="1.5" />
    <path d={arcPath(60, 80, 68, 0, warningAngle)} fill="none" stroke="#b91c35" strokeWidth="7" />
    {[0, 1, 2, 3, 4].map(i => { const a = i / 4 * Math.PI / 2; return <line key={i} x1={60 + 57 * Math.cos(a)} y1={80 + 57 * Math.sin(a)} x2={60 + 68 * Math.cos(a)} y2={80 + 68 * Math.sin(a)} stroke="#dce6ef" strokeWidth="2" />; })}
    <text x="110" y="92">H</text><text x="60" y="130">C</text>
    <text x="44" y="103" className="gauge-caption">TEMP</text>
    <text x="44" y="117" className={temp !== null && temp >= overheat ? "gauge-warning" : ""}>{temp === null ? "—" : `${Math.round(temp)}°C`}</text>
    <Needle angle={(1 - (ratio ?? 0)) * Math.PI / 2} visible={ratio !== null} x={60} y={80} length={63} />
  </g>;
});
