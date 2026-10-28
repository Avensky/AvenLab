import { memo } from "react";
import { Needle } from "./Gauge";
import { arcPath } from "./gaugeGeometry";

export default memo(function FuelGauge({ fuel, capacity }: { fuel: number | null; capacity: number | null }) {
  const ratio = fuel !== null && capacity ? Math.max(0, Math.min(1, fuel / capacity)) : null;
  return <g role="meter" aria-label="Fuel" aria-valuemin={0} aria-valuemax={capacity ?? undefined} aria-valuenow={fuel ?? undefined}
    aria-valuetext={fuel === null ? "Unavailable" : `${fuel.toFixed(1)} liters`}>
    <path d={arcPath(60, 80, 68, -Math.PI / 2, 0)} fill="none" stroke="#dce6ef" strokeWidth="1.5" />
    {[0, 1, 2, 3, 4].map(i => { const a = -Math.PI / 2 + i / 4 * Math.PI / 2; return <line key={i} x1={60 + 57 * Math.cos(a)} y1={80 + 57 * Math.sin(a)} x2={60 + 68 * Math.cos(a)} y2={80 + 68 * Math.sin(a)} stroke={i === 4 ? "#ff6278" : "#dce6ef"} strokeWidth="2" />; })}
    <text x="60" y="34">F</text><text x="110" y="73">E</text>
    <text x="46" y="53" className="gauge-caption">FUEL</text>
    <text x="44" y="67" className={ratio !== null && ratio < 0.25 ? "gauge-warning" : ""}>{fuel === null ? "—" : `${fuel.toFixed(0)} L`}</text>
    <Needle angle={-(ratio ?? 0) * Math.PI / 2} visible={ratio !== null} x={60} y={80} length={63} />
  </g>;
});
