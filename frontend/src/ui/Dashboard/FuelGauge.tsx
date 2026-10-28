import { memo } from "react";
import { Hub, Needle } from "./Gauge";
import { arcPath } from "./gaugeGeometry";
import type { DisplayPower } from "./dashboardModel";

const FuelFace = memo(function FuelFace() {
  return <g className="fuel-face">
    <path d={arcPath(135, 65, 40, -Math.PI / 2, 0)} fill="none" stroke="#dce6ef" strokeWidth="1" />
    {[0, 1, 2, 3, 4].map(i => { const a = -Math.PI / 2 + i / 4 * Math.PI / 2; return <line key={i} x1={135 + 33 * Math.cos(a)} y1={65 + 33 * Math.sin(a)} x2={135 + 40 * Math.cos(a)} y2={65 + 40 * Math.sin(a)} stroke={i === 4 ? "#e9634f" : "#dce6ef"} strokeWidth={i % 2 === 0 ? 2 : 1} />; })}
    <text x="129" y="35">F</text><text x="166" y="72">E</text>
    <image href="/images/gas-station.svg" x="149" y="37" width="10" height="12" className="gauge-symbol" />
  </g>;
});

export default memo(function FuelGauge({ fuel, capacity, power }: { fuel: number | null; capacity: number | null; power: DisplayPower }) {
  const ratio = fuel !== null && capacity ? Math.max(0, Math.min(1, fuel / capacity)) : null;
  const off = power === "off";
  return <g role="meter" aria-label="Fuel" aria-valuemin={0} aria-valuemax={capacity ?? undefined} aria-valuenow={fuel ?? undefined}
    aria-valuetext={fuel === null ? "Unavailable" : `${fuel.toFixed(1)} liters${off ? " · engine off, needle below empty" : ""}`} data-power={power}>
    <FuelFace />
    <Needle angle={off ? .17 : -(ratio ?? 0) * Math.PI / 2} visible={ratio !== null} x={135} y={65} length={37} /><Hub x={135} y={65} />
  </g>;
});
