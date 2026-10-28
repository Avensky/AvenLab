import { memo } from "react";
import { arcPath } from "./gaugeGeometry";

const paths = {
  speed: arcPath(100, 100, 103, Math.PI / 3, 5 * Math.PI / 3),
  rpm: arcPath(100, 100, 103, 3 * Math.PI / 4, 3 * Math.PI / 4 + (7.5 / 9) * ((2 * Math.PI - Math.PI / 36) - 3 * Math.PI / 4)),
  hero: arcPath(100, 100, 103, Math.PI / 3, 5 * Math.PI / 3),
};

// Each ring changes one SVG stroke offset at the existing 20 Hz display rate.
export const ResourceRing = memo(function ResourceRing({ kind, fraction, active = false }: {
  kind: "speed" | "rpm" | "hero"; fraction: number | null; active?: boolean;
}) {
  const percent = fraction === null ? null : Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  const label = kind === "speed" ? "Vehicle condition" : kind === "rpm" ? "NOS reserve" : "Ultimate charge";
  return <div className={`resource-ring resource-ring-${kind}`} data-ready={kind === "hero" && percent === 100}
    data-available={percent !== null} data-active={active} data-damaged={kind === "speed" && percent !== null && percent < 75}
    role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}
    aria-valuetext={percent === null ? "Unavailable" : `${percent} percent${kind === "hero" ? " · damage dealt" : ""}`}
    title={`${label}: ${percent === null ? "unavailable" : `${percent}%`}`}>
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <path d={paths[kind]} transform={kind==="hero"?"translate(200 0) scale(-1 1)":undefined} className="resource-ring-track" />
      <path d={paths[kind]} transform={kind==="hero"?"translate(200 0) scale(-1 1)":undefined} className="resource-ring-fill" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - (percent ?? 0)} />
      {kind === "hero" && <path className="hero-ready-bolt" d="M105 187l-9 12h7l-5 11 13-15h-8z" />}
    </svg>
  </div>;
});
