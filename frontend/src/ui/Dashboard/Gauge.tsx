import { memo } from "react";
import { degrees, type DialTick } from "./gaugeGeometry";

export const ScaleMarks = memo(function ScaleMarks({ ticks, radius, labelRadius, dark = false, small = false, redline = Infinity }: {
  ticks: readonly DialTick[]; radius: number; labelRadius: number; dark?: boolean; small?: boolean; redline?: number;
}) {
  return <g className={`gauge-scale${dark ? " gauge-scale-dark" : ""}${small ? " gauge-scale-small" : ""}`}>
    {ticks.map(({ value, angle, major, medium }) => {
      const inner = radius - (major ? 8 : medium ? 5 : 3);
      return <g key={value} data-tick={value} data-major={major} data-angle={angle}>
        <line x1={100 + inner * Math.cos(angle)} y1={100 + inner * Math.sin(angle)}
          x2={100 + radius * Math.cos(angle)} y2={100 + radius * Math.sin(angle)}
          stroke={value >= redline ? "#b51b20" : dark ? "#1b2025" : "#f1f5f9"} strokeWidth={major ? 1.8 : medium ? 1.2 : .65} />
        {major && <text x={100 + labelRadius * Math.cos(angle)} y={100 + labelRadius * Math.sin(angle)}>{value}</text>}
      </g>;
    })}
  </g>;
});

export const GaugeDisc = memo(function GaugeDisc() {
  return <><circle cx="100" cy="100" r="97" className="gauge-rim" /><circle cx="100" cy="100" r="95" className="gauge-disc" /></>;
});

export function Needle({ angle, visible = true, x = 80, y = 80, length = 71 }: { angle: number; visible?: boolean; x?: number; y?: number; length?: number }) {
  return <g className="gauge-needle" opacity={visible ? 1 : 0} style={{ transformOrigin: `${x}px ${y}px`, transform: `rotate(${degrees(angle)}deg)` }}>
    <path d={`M ${x + length} ${y} L ${x - 12} ${y - 2.4} L ${x - 12} ${y + 2.4} Z`} />
  </g>;
}
export function Hub({ x = 80, y = 80 }: { x?: number; y?: number }) { return <circle cx={x} cy={y} r="9" className="gauge-hub" />; }
