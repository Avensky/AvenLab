import { memo } from "react";
import { arcPath, degrees } from "./gaugeGeometry";
export const TickRing = memo(function TickRing({ max, steps, start, end, white = false, redline = Infinity }: {
  max: number; steps: number; start: number; end: number; white?: boolean; redline?: number;
}) {
  return <g className={white ? "gauge-ticks gauge-ticks-dark" : "gauge-ticks"}>
    <circle cx="80" cy="80" r="78" className="gauge-disc" />
    {white && <path d={arcPath(80, 80, 60, start, end)} stroke="#f1f5f9" strokeWidth="38" fill="none" />}
    <path d={arcPath(80, 80, 78, start, end)} fill="none" stroke={white ? "#111827" : "#e2e8f9"} strokeWidth="1" />
    {Array.from({ length: steps * 4 + 1 }, (_, i) => {
      const value = max * i / (steps * 4), angle = start + i / (steps * 4) * (end - start);
      const major = i % 4 === 0, medium = i % 2 === 0, inner = major ? 64 : medium ? 69 : 73;
      return <g key={i}>
        <line x1={80 + inner * Math.cos(angle)} y1={80 + inner * Math.sin(angle)} x2={80 + 78 * Math.cos(angle)} y2={80 + 78 * Math.sin(angle)}
          stroke={value >= redline ? "#b91c35" : white ? "#111827" : "#f8fafc"} strokeWidth={major ? 2.5 : medium ? 1.5 : 0.8} />
        {major && <text x={80 + 53 * Math.cos(angle)} y={80 + 53 * Math.sin(angle)} fill={white ? "#111827" : "#f8fafc"}>{Math.round(value)}</text>}
      </g>;
    })}
  </g>;
});
export function Needle({ angle, visible = true, x = 80, y = 80, length = 71 }: { angle: number; visible?: boolean; x?: number; y?: number; length?: number }) {
  return <g className="gauge-needle" opacity={visible ? 1 : 0} style={{ transformOrigin: `${x}px ${y}px`, transform: `rotate(${degrees(angle)}deg)` }}>
    <path d={`M ${x + length} ${y} L ${x - 14} ${y - 3.4} L ${x - 14} ${y + 3.4} Z`} />
  </g>;
}
export function Hub({ x = 80, y = 80 }: { x?: number; y?: number }) { return <circle cx={x} cy={y} r="9" className="gauge-hub" />; }
