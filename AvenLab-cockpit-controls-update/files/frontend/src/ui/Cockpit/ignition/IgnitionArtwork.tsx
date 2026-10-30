import {
  IGNITION_ANGLES as angles,
  IGNITION_POSITIONS as positions,
  IGNITION_LABEL_RADIUS,
  IGNITION_RING_RADIUS,
  ignitionTravelPath,
  ignitionViewBox,
} from "./geometry";
/** Presentation only: the outer ring sits beyond the labels; the illuminated
 * travel arc follows the held key through OFF/ACC/ON/START. Physics stays in Rust. */
export function IgnitionArtwork({
  gradient,
  shown,
  holding,
  keyInserted,
}: {
  gradient: string;
  shown: number;
  holding: boolean;
  keyInserted: boolean;
}) {
  return (
    <svg viewBox={ignitionViewBox()} aria-hidden="true">
      <defs>
        <radialGradient id={gradient}>
          <stop stopColor="#303d49" />
          <stop offset=".68" stopColor="#07111a" />
          <stop offset=".73" stopColor="#c0c9ce" />
          <stop offset=".9" stopColor="#4f5b64" />
          <stop offset="1" stopColor="#111820" />
        </radialGradient>
      </defs>
      <circle
        className="ignition-trim"
        cx="60"
        cy="60"
        r="43"
        fill={`url(#${gradient})`}
        stroke="#9ba8b0"
      />
      <circle
        className="ignition-ring"
        cx="60"
        cy="60"
        r={IGNITION_RING_RADIUS}
        fill="none"
        stroke="var(--app-accent, #9ae6ff)"
        strokeWidth="3"
      />
      {positions.map((label, i) => {
        const a = (angles[i] * Math.PI) / 180;
        return (
          <g key={label} data-key-position={i}>
            <path
              d={`M${60 + 43 * Math.cos(a)} ${60 + 43 * Math.sin(a)}L${60 + 48 * Math.cos(a)} ${60 + 48 * Math.sin(a)}`}
              stroke={holding && shown >= i ? "#abe6f6" : "#7e919e"}
              strokeWidth="2"
            />
            <text
              transform={`translate(${60 + IGNITION_LABEL_RADIUS * Math.cos(a)} ${60 + IGNITION_LABEL_RADIUS * Math.sin(a)}) rotate(${angles[i] + 90})`}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={holding && shown === i ? "#d3f5ff" : "#c0ced7"}
              fontSize="6"
            >
              {label}
            </text>
          </g>
        );
      })}
      <path
        className="key-travel"
        d={ignitionTravelPath()}
        fill="none"
        pathLength="3"
        stroke="#9ae6ff"
        strokeWidth="2"
        strokeDasharray="3"
        strokeDashoffset={3 - shown}
      />
      <path d="M58 50v20h4V50z" fill="#03090e" stroke="#657680" />
      {(keyInserted || holding) && (
        <g className="radial-key" transform={`rotate(${angles[shown]} 60 60)`}>
          <path d="M50 57h39v6H76l-4-3-4 3H50z" fill="#bcc8ce" />
          <rect
            x="36"
            y="50"
            width="24"
            height="20"
            rx="4"
            fill="#1a242e"
            stroke="#77858e"
          />
          <path d="M41 54h14v12H41z" fill="none" stroke="#3e4c57" />
        </g>
      )}
    </svg>
  );
}
