import { memo } from "react";
import { Hub, Needle, TickRing } from "./Gauge";

const start = -4 * Math.PI / 3, end = 0;
export default memo(function Revolutions({ rpm, gear, maxRpm, redlineRpm, engineOn }: {
  rpm: number | null; gear: number | null; maxRpm: number; redlineRpm: number; engineOn: boolean;
}) {
  const ratio = Math.max(0, Math.min(1, (rpm ?? 0) / maxRpm));
  return <div className="revolutions-wrapper" role="meter" aria-label="Engine RPM" aria-valuemin={0} aria-valuemax={maxRpm}
    aria-valuenow={rpm ?? undefined} aria-valuetext={rpm === null ? "Unavailable" : `${rpm} RPM`}>
    <svg viewBox="0 0 160 160" aria-hidden="true">
      <TickRing max={maxRpm / 1000} steps={Math.round(maxRpm / 1000)} redline={redlineRpm / 1000} start={start} end={end} white />
      <text x="84" y="107" className="gauge-caption">RPM ×1000</text>
      <g className={engineOn ? "gauge-lcd" : "gauge-lcd gauge-lcd-off"}>
        <rect x="83" y="116" width="46" height="28" rx="1" /><text x="106" y="131">{gear === null ? "—" : gear === -1 ? "R" : gear === 0 ? "N" : gear}</text>
      </g>
      <text x="58" y="133" className="gauge-caption">GEAR</text>
      <Needle angle={start + ratio * (end - start)} visible={rpm !== null} /><Hub />
    </svg>
  </div>;
});
