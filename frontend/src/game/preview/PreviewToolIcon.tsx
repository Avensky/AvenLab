export const PREVIEW_BOOT_ICON = "M7 4h7v9l5 3v4H5v-5l2-3zM5 17h14";
export const PREVIEW_HAND_ICON = "M9 13V5a1 1 0 0 1 2 0v6-7a1 1 0 0 1 2 0v7-5a1 1 0 0 1 2 0v6-3a1 1 0 0 1 2 0v7l-2 4H9l-4-6a1 1 0 0 1 2-1l2 2";

const ICON_PATHS = {
  camera: "M3 6h4l2-3h6l2 3h4v14H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  adjustments: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-7 0v6",
  zoomOut: "M14 10a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z M13 14l6 6 M7 10h4",
  zoomIn: "M14 10a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z M13 14l6 6 M7 10h4m-2-2v4",
  makeupCheck: "M19 9a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM12 16v6m-3 0h6M9 8l2-2",
  lipstick: "M8 13h8v8H8zM10 13V7l4-4v10",
  eyeliner: "M4 17l1-4L16 2l3 3L8 16l-4 1ZM13 5l3 3M4 21c5-3 9-3 15-2",
  lookAway: "M20 12s-3 4-8 4-8-4-8-4 3-4 8-4 8 4 8 4Z M9 12h1 M5 4H2m0 0 2-2M2 4l2 2",
  hold: "M9 5v14m6-14v14",
  resume: "m9 5 10 7-10 7z",
  reframe: "M3 8V3h5m8 0h5v5m0 8v5h-5m-8 0H3v-5m9-7v6m-3-3h6",
} as const;

export function PreviewToolIcon({ icon }: { icon: keyof typeof ICON_PATHS }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PATHS[icon]} /></svg>;
}

export function PreviewCameraChoiceIcon({ path }: { path: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={path} /></svg>;
}
