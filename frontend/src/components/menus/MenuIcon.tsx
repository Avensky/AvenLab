const play = "m7 4 14 8-14 8Z";
const monitor = "M3 4h18v12H3zM8 20h8m-4-4v4";
const car = "M3 14h18l-2-5a2 2 0 0 0-2-1H7a2 2 0 0 0-2 1zm1 0v5m16-5v5M7 17h10M7 12h.01m10 0h.01";
const globe = "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c-5 4-5 14 0 18 5-4 5-14 0-18ZM3 12h18";

const paths = {
  play,
  resume: play,
  explore: "m3 18 6-10 4 6 2-3 6 7ZM15 6h6m-3-3v6",
  heroes: "m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6zm0 5 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z",
  career: "M4 20h16M6 16v-4m6 4V8m6 8V4",
  social: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6 8v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M16 5a3 3 0 0 1 0 6m5 8v-2a4 4 0 0 0-3-4",
  settings: "M3 6h5m4 0h9M3 12h10m4 0h4M3 18h3m4 0h11M8 4v4m5 2v4m-7 2v4",
  debug_menu: "M8 6 6 3m10 3 2-3M7 9H4m16 0h-3M7 14H4m16 0h-3m-5-7a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0v-3a5 5 0 0 1 5-5Zm0 1v12",
  vehicle_select: car,
  vehicles: car,
  cockpit: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM3 11h7m4 0h7m-9 3v7",
  missions: "M3 21h18M5 20V4h13l-3 4 3 4H5",
  leave_game: "M10 4H4v16h6m4-12 4 4-4 4m-6-4h10",
  display: monitor,
  rendering: monitor,
  hud: "M4 8V5h4m8 0h4v3m0 8v3h-4m-8 0H4v-3m3-4h10m-5-5v10",
  drivetrain: "M5 5v14m7-14v14m7-14v14M5 12h14",
  audio: "M3 10v4h4l5 4V6l-5 4zm12-1a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12",
  keyboard: "M3 6h18v12H3zm3 4h.01m3 0h.01m3 0h.01m3 0h.01m3 0h.01m-11 4h10",
  controller: "M8 8h8a4 4 0 0 1 4 3l1 5a2 2 0 0 1-3 2l-3-3H9l-3 3a2 2 0 0 1-3-2l1-5a4 4 0 0 1 4-3Zm-2 4h4m-2-2v4m8-2h.01m2 2h.01",
  other: "M5 12h.01m7 0h.01m7 0h.01",
  accessibility: "M12 5h.01M5 8l7 2 7-2m-7 2v5m0 0-4 6m4-6 4 6",
  appearance: "M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4 1 1 0 0 1 1-2h2a4 4 0 0 0 4-4c0-4-4-8-9-8ZM7 11h.01m3-4h.01m5 0h.01m3 4h.01",
  garage: "m3 9 9-5 9 5v11H3zm4 11v-8h10v8",
  visualizers: "M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4m0-4h16",
  environment: globe,
  tank: "m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6zM8 11h8m-4-3v6",
  dps: "M6 19 18 5m-3 0h3v3M5 12l5-5m4 10 5-5",
  support: "M9 4h6v5h5v6h-5v5H9v-5H4V9h5z",
  sea: "M3 15l3 4h12l3-4-9-3zm9-3V4m0 1h5l-1 3h-4M2 22q2-2 5 0 2 1 5-1 2 2 5 0 3 2 5 0",
  air: "M12 3c-1 0-2 2-2 4v4l-7 5v2l7-2v3l-2 2 4-1 4 1-2-2v-3l7 2v-2l-7-5V7c0-2-1-4-2-4z",
  concepts: "m12 3 8 5v8l-8 5-8-5V8zm0 5v4m-4-2 4 2 4-2m-4 2v5",
  captures: "M3 12h4l3-6 4 12 3-6h4",
};

export type MenuIconName = keyof typeof paths;

export function MenuIcon({ name }: { name: MenuIconName }) {
  return (
    <svg className="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  );
}
