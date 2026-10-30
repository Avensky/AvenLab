/** HUD component IDs and defaults are device preferences, never simulation flags.
 * Keep old IDs stable so saved layouts survive refactors. New IDs get defaults. */
export const HUD_GROUPS = [
  "gauges",
  "wheel",
  "stalks",
  "pedals",
  "ignition",
  "display",
  "climate",
  "hazards",
  "shifter",
  "parking",
  "assists",
  "minimap",
  "chat",
] as const;
export type HudGroupId = (typeof HUD_GROUPS)[number];
export const DEFAULT_HUD_GROUPS: Record<HudGroupId, boolean> = {
  gauges: true,
  wheel: true,
  stalks: true,
  pedals: true,
  ignition: true,
  display: true,
  climate: false,
  hazards: false,
  shifter: true,
  parking: true,
  assists: true,
  minimap: true,
  chat: true,
};

/** One wording source for Settings and Cockpit → Research. */
export const HUD_GROUP_LABELS: Record<HudGroupId, string> = {
  gauges: "INSTRUMENTS",
  wheel: "STEERING WHEEL",
  stalks: "WHEEL LEVERS",
  pedals: "PEDALS",
  ignition: "IGNITION KEY",
  display: "RADIO / MISSIONS",
  climate: "CLIMATE CONTROLS",
  hazards: "EMERGENCY LIGHTS",
  shifter: "SHIFTER",
  parking: "PARKING BRAKE",
  assists: "DRIVING ASSISTS",
  minimap: "GPS / MINIMAP",
  chat: "CHAT",
};
export const RESEARCH_HUD_GROUPS = [
  "climate",
  "hazards",
  "stalks",
  "ignition",
  "minimap",
  "parking",
  "assists",
  "shifter",
  "pedals",
] as const;
