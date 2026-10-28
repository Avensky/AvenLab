import { memo } from "react";
import { Hub, Needle } from "./Gauge";
import { arcPath } from "./gaugeGeometry";

const FuelFace = memo(function FuelFace() {
  return <g className="fuel-face">
    <path d={arcPath(100, 67, 62, -Math.PI / 2, 0)} fill="none" stroke="#dce6ef" strokeWidth="1" />
    {[0, 1, 2, 3, 4].map(i => { const a = -Math.PI / 2 + i / 4 * Math.PI / 2; return <line key={i} x1={100 + 54 * Math.cos(a)} y1={67 + 54 * Math.sin(a)} x2={100 + 62 * Math.cos(a)} y2={67 + 62 * Math.sin(a)} stroke={i === 4 ? "#e9634f" : "#dce6ef"} strokeWidth={i % 2 === 0 ? 2 : 1} />; })}
    <text x="100" y="24">F</text><text x="149" y="69">E</text>
    <image href="/images/gas-station.svg" x="135" y="29" width="11" height="13" className="gauge-symbol" />
  </g>;
});

export default memo(function FuelGauge({ fuel, capacity }: { fuel: number | null; capacity: number | null }) {
  const ratio = fuel !== null && capacity ? Math.max(0, Math.min(1, fuel / capacity)) : null;
  return <g role="meter" aria-label="Fuel" aria-valuemin={0} aria-valuemax={capacity ?? undefined} aria-valuenow={fuel ?? undefined}
    aria-valuetext={fuel === null ? "Unavailable" : `${fuel.toFixed(1)} liters`}>
    <FuelFace />
    <Needle angle={-(ratio ?? 0) * Math.PI / 2} visible={ratio !== null} x={100} y={67} length={58} /><Hub x={100} y={67} />
  </g>;
});
