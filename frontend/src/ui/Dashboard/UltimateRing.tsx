import { memo } from "react";
import { arcPath } from "./gaugeGeometry";

const path = arcPath(100, 100, 102, 3 * Math.PI / 4, 2 * Math.PI - Math.PI / 36);

// Static SVG track, one quantized stroke offset. No canvas or animation loop.
export const UltimateRing = memo(function UltimateRing({ fraction }: { fraction: number | null }) {
  const percent = fraction === null ? null : Math.round(fraction * 100);
  return <div className="ultimate-ring" data-ready={percent === 100} data-available={percent !== null}
    role="meter" aria-label="Ultimate charge" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}
    aria-valuetext={percent === null ? "Unavailable" : `${percent} percent · damage dealt`} title={percent === null ? "Ultimate charge unavailable" : `Ultimate ${percent}% · earned from damage dealt`}>
    <svg viewBox="0 0 200 200" aria-hidden="true"><path d={path} className="ultimate-track" />
      <path d={path} className="ultimate-fill" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - (percent ?? 0)} /></svg>
  </div>;
});
