import { memo } from "react";
import { Hub, Needle, TickRing } from "./Gauge";

const start = -7 * Math.PI / 4, end = -Math.PI / 3;
export default memo(function Speedometer({ speed, maxSpeed, unit }: { speed: number | null; maxSpeed: number; unit: string }) {
  const ratio = Math.max(0, Math.min(1, (speed ?? 0) / maxSpeed));
  return <div className="speedometer-wrapper" role="meter" aria-label="Speed" aria-valuemin={0} aria-valuemax={maxSpeed}
    aria-valuenow={speed === null ? undefined : Math.min(maxSpeed, speed)} aria-valuetext={speed === null ? "Unavailable" : `${Math.round(speed)} ${unit}`}>
    <svg viewBox="0 0 160 160" aria-hidden="true">
      <TickRing max={maxSpeed} steps={8} start={start} end={end} />
      <text x="80" y="94" className="gauge-caption">{unit}</text>
      <text x="80" y="114" className="gauge-speed">{speed === null ? "—" : Math.round(speed)}</text>
      <Needle angle={start + ratio * (end - start)} visible={speed !== null} /><Hub />
    </svg>
  </div>;
});
