import { memo } from "react";
import { Hub, Needle } from "./Gauge";
import { arcPath } from "./gaugeGeometry";
import type { DisplayPower } from "./dashboardModel";

const FuelFace = memo(function FuelFace() {
  return <g className="fuel-face">
    <path d={arcPath(130, 70, 52, -Math.PI / 2, 0)} fill="none" stroke="#dce6ef" strokeWidth="1" />
    {[0, 1, 2, 3, 4].map(i => { const a = -Math.PI / 2 + i / 4 * Math.PI / 2; return <line key={i} x1={130 + 44 * Math.cos(a)} y1={70 + 44 * Math.sin(a)} x2={130 + 52 * Math.cos(a)} y2={70 + 52 * Math.sin(a)} stroke={i === 4 ? "#e9634f" : "#dce6ef"} strokeWidth={i % 2 === 0 ? 2 : 1} />; })}
    <text x="123" y="29">F</text><text x="172" y="77">E</text>
    <image href="/images/gas-station.svg" x="151" y="34" width="10" height="12" className="gauge-symbol" />
  </g>;
});

export default memo(function FuelGauge({ fuel, capacity, power }: { fuel: number | null; capacity: number | null; power: DisplayPower }) {
  const ratio = fuel !== null && capacity ? Math.max(0, Math.min(1, fuel / capacity)) : null;
  const off = power === "off";
  return <g role="meter" aria-label="Fuel" aria-valuemin={0} aria-valuemax={capacity ?? undefined} aria-valuenow={fuel ?? undefined}
    aria-valuetext={fuel === null ? "Unavailable" : `${fuel.toFixed(1)} liters${off ? " · engine off, needle below empty" : ""}`} data-power={power}>
    <FuelFace />
    <Needle angle={off ? .17 : -(ratio ?? 0) * Math.PI / 2} visible={ratio !== null} x={130} y={70} length={48} /><Hub x={130} y={70} />
  </g>;
});
