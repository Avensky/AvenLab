import type { ReactNode } from "react";
import type { Piece } from "../document/layoutDocument";
export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    select: <path d="m4 3 12 8-6 1-3 6Z" />,
    translate: (
      <path d="M10 2v16M2 10h16m-11-5 3-3 3 3m0 10-3 3-3-3M5 7l-3 3 3 3m10 0 3-3-3-3" />
    ),
    rotate: <path d="M16 7a7 7 0 1 0 0 7M16 3v5h-5" />,
    scale: <path d="M4 9V4h5m2 12h5v-5M4 4l5 5m7 7-5-5" />,
    undo: <path d="M7 5 3 9l4 4M3 9h9a5 5 0 0 1 5 5" />,
    redo: <path d="m13 5 4 4-4 4m4-4H8a5 5 0 0 0-5 5" />,
    save: <path d="M3 3h12l2 2v12H3ZM6 3v5h7V3M6 17v-6h8v6" />,
    export: <path d="M10 13V2m-4 4 4-4 4 4M3 11v6h14v-6" />,
    search: (
      <>
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="m13 13 4 4" />
      </>
    ),
    duplicate: <path d="M7 7h10v10H7ZM13 7V3H3v10h4" />,
    close: <path d="m5 5 10 10M15 5 5 15" />,
    fit: <path d="M3 7V3h4m6 0h4v4m0 6v4h-4M7 17H3v-4" />,
    layers: <path d="m10 2 8 4-8 4-8-4Zm-8 8 8 4 8-4m-16 4 8 4 8-4" />,
    cube: <path d="m10 2 8 4v9l-8 4-8-4V6Zm0 8v9M2 6l8 4 8-4M10 2v8" />,
  };
  return (
    <svg
      className="le-icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.cube}
    </svg>
  );
}
export function Thumbnail({ piece }: { piece: Piece }) {
  if (piece.vehicle)
    return (
      <svg viewBox="0 0 100 60" aria-hidden="true" className="le-thumbnail">
        <ellipse cx="50" cy="49" rx="35" ry="5" fill="#020815" />
        <path d="m12 33 20-10 42 7 14 13-22 10-49-10Z" fill={piece.color} />
        <path
          d="m31 23 11-11 24 4 9 14-23 10Z"
          fill="#33516b"
          stroke={piece.color}
          strokeWidth="3"
        />
        <path d="m43 14 1 15 20 5 2-15" fill="#182c40" />
        <ellipse cx="28" cy="43" rx="7" ry="8" fill="#101923" />
        <ellipse cx="72" cy="47" rx="7" ry="8" fill="#101923" />
        <ellipse cx="28" cy="43" rx="3" ry="4" fill="#9eafbf" />
        <ellipse cx="72" cy="47" rx="3" ry="4" fill="#9eafbf" />
      </svg>
    );
  if (piece.category === "objectives")
    return (
      <svg viewBox="0 0 100 60" aria-hidden="true" className="le-thumbnail">
        {piece.id.startsWith("ctf-") || piece.id === "payload-route" ? (
          <>
            <path
              d="M14 47 43 33 86 43 56 56Z"
              fill="none"
              stroke={piece.color}
              strokeWidth="3"
            />
            <path
              d="M47 39V7l24 7-24 9"
              stroke={piece.color}
              strokeWidth="3"
              fill={piece.color}
            />
          </>
        ) : piece.id === "finish-line" ? (
          <>
            {Array.from({ length: 10 }, (_, i) => (
              <rect
                key={i}
                x={10 + (i % 5) * 16}
                y={15 + Math.floor(i / 5) * 15}
                width="16"
                height="15"
                fill={((i % 5) + Math.floor(i / 5)) % 2 ? "#213042" : "#edf3f7"}
              />
            ))}
          </>
        ) : (
          <path d="M45 53V29H23L50 6 79 29H57v24Z" fill={piece.color} />
        )}
      </svg>
    );
  const h = Math.min(22, Math.max(3, piece.size[1] * 1.4)),
    top = 32 - h;
  return (
    <svg viewBox="0 0 100 60" aria-hidden="true" className="le-thumbnail">
      <ellipse cx="51" cy="49" rx="32" ry="6" fill="#152820" opacity=".65" />
      {piece.id === "ramp" ? (
        <>
          <path d="M20 42 47 9 80 23 53 55Z" fill={piece.color} />
          <path d="M47 9v19l33 14V23Z" fill="#e0c28c" />
          <path d="m53 55 27-32v19Z" fill="#8b805f" />
        </>
      ) : (
        <>
          <path
            d={`M20 ${top + 12} 47 ${top - 1} 80 ${top + 13} 53 ${top + 27}Z`}
            fill={piece.color}
          />
          <path
            d={`M20 ${top + 12}v${h}l33 14V${top + 27}Z`}
            fill={piece.color}
            style={{ filter: "brightness(.76)" }}
          />
          <path
            d={`M53 ${top + 27} 80 ${top + 13}v${h}L53 ${top + h + 27}Z`}
            fill={piece.color}
            style={{ filter: "brightness(.56)" }}
          />
          {piece.id === "garage" && (
            <path
              d={`M31 ${top + 22}v${h - 5}l13 6V${top + 28}Z`}
              fill="#213c31"
            />
          )}
          {piece.category === "roads" && piece.id !== "sidewalk" && (
            <path d={`m31 ${top + 17} 36-17`} stroke="#e7d18a" />
          )}
        </>
      )}
    </svg>
  );
}
