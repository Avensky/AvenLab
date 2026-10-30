import { memo, useId } from "react";

// Code-native vector face: one reusable shape, no image decode or drawing loop.
export const WheelArtwork = memo(function WheelArtwork() {
  const id = useId().replaceAll(":", "");
  return (
    <svg viewBox="0 0 240 240" aria-hidden="true" className="wheel-artwork">
      <defs>
        <linearGradient id={`${id}metal`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#d3d5d5" />
          <stop offset=".45" stopColor="#8b9398" />
          <stop offset=".6" stopColor="#e5e6e4" />
          <stop offset="1" stopColor="#656c72" />
        </linearGradient>
        <radialGradient id={`${id}leather`} cx=".4" cy=".2">
          <stop stopColor="#44474a" />
          <stop offset=".5" stopColor="#242629" />
          <stop offset="1" stopColor="#121418" />
        </radialGradient>
        <pattern
          id={`${id}pores`}
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1.5" cy="1.5" r=".65" fill="#08090c" />
        </pattern>
      </defs>
      <circle
        cx="120"
        cy="120"
        r="108"
        fill="none"
        stroke="#080a0d"
        strokeWidth="25"
      />
      <circle
        cx="120"
        cy="120"
        r="108"
        fill="none"
        stroke={`url(#${id}leather)`}
        strokeWidth="21"
      />
      <path
        d="M21 79a108 108 0 0 0-1 80M219 79a108 108 0 0 1 1 80"
        fill="none"
        stroke={`url(#${id}pores)`}
        strokeWidth="20"
      />
      <path
        d="M28 77a100 100 0 0 0 0 85M212 77a100 100 0 0 1 0 85"
        fill="none"
        stroke="#a13c3d"
        strokeWidth="1"
        strokeDasharray="2 2.5"
      />
      <path
        d="M25 104l51 2 15 28-62-7zm190 0l-51 2-15 28 62-7z"
        fill="#282c31"
        stroke="#555a60"
        strokeWidth="1"
      />
      <path
        d="M75 144l30 17 2 51h27l3-51 28-17-6-11H81z"
        fill={`url(#${id}metal)`}
        stroke="#555c63"
        strokeWidth="1.2"
      />
      <path d="M115 160h10v44h-10z" fill="#181d22" />
      <path
        d="M67 85q53-25 106 0l8 28q-4 52-61 62-57-10-61-62z"
        fill={`url(#${id}leather)`}
        stroke="#090b0e"
        strokeWidth="3"
      />
      <path
        d="M72 94q48-22 96 0"
        stroke="#5a5b5d"
        strokeWidth=".7"
        fill="none"
      />
      <ellipse
        cx="120"
        cy="118"
        rx="24"
        ry="13"
        fill="#101317"
        stroke={`url(#${id}metal)`}
        strokeWidth="2"
      />
      <path d="M97 118h46M120 106v5m0 14v5" stroke="#aeb5ba" strokeWidth="1" />
      <rect x="101" y="113" width="38" height="10" rx="4" fill="#252b30" />
      <text
        x="120"
        y="121"
        textAnchor="middle"
        fill="#d5d8d8"
        fontFamily="sans-serif"
        fontWeight="700"
        fontSize="7"
      >
        SCION
      </text>
      <text
        x="120"
        y="145"
        textAnchor="middle"
        fill="#65666a"
        fontFamily="sans-serif"
        fontSize="4"
      >
        SRS AIRBAG
      </text>
    </svg>
  );
});
