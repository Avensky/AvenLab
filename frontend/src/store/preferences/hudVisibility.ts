/** HUD component IDs and defaults are device preferences, never simulation flags.
 * Keep old IDs stable so saved layouts survive refactors. New IDs get defaults. */
export const HUD_GROUPS = [
  "gauges",
  "futuristic",
  "teammates",
  "wheel",
  "stalks",
  "pedals",
  "ignition",
  "display",
  "missions",
  "climate",
  "performance",
  "hazards",
  "shifter",
  "turret",
  "parking",
  "assists",
  "minimap",
  "chat",
] as const;
export type HudGroupId = (typeof HUD_GROUPS)[number];
export const DEFAULT_HUD_GROUPS: Record<HudGroupId, boolean> = {
  gauges: true,
  futuristic: false,
  teammates: true,
  wheel: true,
  stalks: true,
  pedals: true,
  ignition: true,
  display: true,
  missions: true,
  climate: false,
  performance: false,
  hazards: false,
  shifter: true,
  turret: true,
  parking: true,
  assists: true,
  minimap: true,
  chat: true,
};

/** One wording source for Settings and Cockpit → Research. */
export const HUD_GROUP_LABELS: Record<HudGroupId, string> = {
  gauges: "CLASSIC THREE GAUGES",
  futuristic: "FUTURISTIC RESOURCE HUD",
  teammates: "TEAMMATE PORTRAITS",
  wheel: "STEERING WHEEL",
  stalks: "WHEEL LEVERS",
  pedals: "PEDALS",
  ignition: "IGNITION KEY",
  display: "RADIO",
  missions: "MISSIONS / MATCH EVENTS",
  climate: "CLIMATE DASHBOARD",
  performance: "PERFORMANCE READOUT",
  hazards: "EMERGENCY LIGHTS",
  shifter: "SHIFTER",
  turret: "TURRET AIM / FIRE",
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
  "turret",
  "pedals",
] as const;

/** Legacy master switches are now bulk presets, never additional render gates.
 * Individual groups can be mixed freely after either preset is applied. */
export const HUD_VISIBILITY_VERSION = 2;
export const TOUCH_HUD_GROUPS = ["wheel", "stalks", "pedals", "turret"] as const;
export const DRIVE_HUD_GROUPS = [
  "ignition", "display", "missions", "climate", "performance", "hazards",
  "shifter", "parking", "assists",
] as const;
export const hasTouchHud = (groups: Record<HudGroupId, boolean>) =>
  TOUCH_HUD_GROUPS.some((id) => groups[id]);
export const hasDriveHud = (groups: Record<HudGroupId, boolean>) =>
  DRIVE_HUD_GROUPS.some((id) => groups[id]);

export const CLIMATE_HUD_SIZES = ["single", "compact", "full"] as const;
export const CLIMATE_HUD_LABELS = {
  single: "SINGLE BAR HUD", compact: "COMPACT HUD", full: "FULL HUD",
} as const;
