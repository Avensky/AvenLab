import { DEFAULT_VEHICLE_COSMETICS, sanitizeVehicleCosmetics, type VehicleCosmetics } from "../../vehicles/cosmetics/catalog";
/** Persisted device/accessibility preferences. Requests and vehicle physics live
 * elsewhere; this store owns only what the user sees and how input is mapped. */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { shallow } from "zustand/shallow";
import { isUITheme, type UITheme } from "../../theme/catalog";
import {
  DEFAULT_GARAGE_EFFECTS,
  sanitizeGarageEffects,
  type GarageEffects,
} from "./garageEffects";

import {sanitizeHealthBarMode,type HealthBarMode} from "./healthVisibility";
import {DEFAULT_NOTICE_CHANNELS,sanitizeNoticeChannels,type NoticeChannel} from '../../combat/noticeModel';
import {DEFAULT_BINDINGS,sanitizeBindings} from './keyBindings';
import type {BindingAction} from './keyBindings';
export {DEFAULT_BINDINGS,RESERVED_KEYS,isBindingKey} from './keyBindings';
export type {BindingAction} from './keyBindings';
import {
  HUD_GROUPS,
  DEFAULT_HUD_GROUPS,
  HUD_VISIBILITY_VERSION,
  TOUCH_HUD_GROUPS,
  DRIVE_HUD_GROUPS,
  hasTouchHud,
  hasDriveHud,
  type HudGroupId,
} from "./hudVisibility";
// Stable exports for callers from the previous patch. New callers use index.ts.
export {
  HUD_GROUPS,
  DEFAULT_HUD_GROUPS,
  type HudGroupId,
} from "./hudVisibility";
export type MenuHeaderStyle = "classic" | "angled";
export type Preferences = {
  /** Marks the one-time migration from hidden parent gates to independent widgets. */
  hudVisibilityVersion: number;
  radioHudStyle: "classic" | "streamlined" | "no-tabs";
  healthBars: HealthBarMode;
  notificationChannels:Record<NoticeChannel,boolean>;
  theme: UITheme;
  menuHeaderStyle: MenuHeaderStyle;
  vehicleCosmetics: Pick<VehicleCosmetics,"matchCockpit">;
  garageEffects: GarageEffects;
  ignitionVisibility: "always" | "hidden";
  /** Compatibility alias for hudGroups.climate; actions keep both synchronized. */
  researchHud: boolean;
  /** Compact/full HVAC affects the driving widget; its cockpit page stays usable. */
  climateHudSize: "single" | "compact" | "full";
  parkingCrystals: boolean;
  parkingBrakeStyle: "lever" | "button";
  /** Three HUD switches by default; keep the expanded bank as a saved option. */
  assistHudLayout: "three" | "extended";
  /** Instrument gain; engine-off dimming multiplies this saved level. */
  dashboardBrightness: number;
  fov: number;
  cameraSensitivity: number;
  turretYawSensitivity:number;
  turretPitchSensitivity:number;
  controllerDeadzone: number;
  steeringSensitivity: number;
  invertSteering: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  menuTextScale: number;
  bindings: Record<BindingAction, string>;
  favoriteVehicles: string[];
  touchLayout: "pedals" | "sticks";
  drivingLayout: "standard" | "controller";
  showTouchControls: boolean;
  showDriveControls: boolean;
  speedUnit: "kmh" | "mph";
  shiftLayout: "h-pattern" | "automatic";
  hudGroups: Record<HudGroupId, boolean>;
  wheelDrop: number;
  steeringTravel: number;
  minimapScale: number;
};
/** A page edits only the HUD switches it owns; the store merges saved siblings. */
export type PreferenceUpdate = Omit<
  Partial<Preferences>,
  "hudGroups" | "garageEffects" | "vehicleCosmetics"
> & {
  hudGroups?: Partial<Record<HudGroupId, boolean>>;
  garageEffects?: Partial<GarageEffects>;
  vehicleCosmetics?: Partial<Pick<VehicleCosmetics,"matchCockpit">>;
};
export const DEFAULT_PREFERENCES: Preferences = {
  hudVisibilityVersion: HUD_VISIBILITY_VERSION,
  radioHudStyle: "no-tabs",
  healthBars: "all",
  notificationChannels:DEFAULT_NOTICE_CHANNELS,
  theme: "navy",
  menuHeaderStyle: "angled",
  vehicleCosmetics: {matchCockpit:DEFAULT_VEHICLE_COSMETICS.matchCockpit},
  garageEffects: DEFAULT_GARAGE_EFFECTS,
  ignitionVisibility: "always",
  researchHud: false,
  climateHudSize: "compact",
  parkingCrystals: false,
  parkingBrakeStyle: "lever",
  assistHudLayout: "three",
  dashboardBrightness: 1,
  fov: 75,
  cameraSensitivity: 1,
  turretYawSensitivity:1,
  turretPitchSensitivity:1,
  controllerDeadzone: 0.12,
  steeringSensitivity: 1,
  invertSteering: false,
  reducedMotion: false,
  highContrast: false,
  menuTextScale: 1,
  bindings: DEFAULT_BINDINGS,
  favoriteVehicles: [],
  touchLayout: "pedals",
  speedUnit: "kmh",
  drivingLayout: "standard",
  showTouchControls: true,
  showDriveControls: true,
  shiftLayout: "h-pattern",
  hudGroups: DEFAULT_HUD_GROUPS,
  wheelDrop: 0.28,
  steeringTravel: 1.12,
  minimapScale: 0.75,
};
// Fixed shortcuts remain available; rebinding movement must never steal them.
// The persisted payload is treated as input, so old/corrupt settings cannot
// disable steering or inject an unbounded menu scale after a reload.
export function sanitizePreferences(value: unknown): Preferences {
  const data =
    value && typeof value === "object" ? (value as Partial<Preferences>) : {};
  const numeric = (key: keyof Preferences, min: number, max: number) =>
    typeof data[key] === "number" && Number.isFinite(data[key])
      ? Math.min(max, Math.max(min, data[key] as number))
      : (DEFAULT_PREFERENCES[key] as number);
  const bindings=sanitizeBindings(data.bindings);
  const visibility =
    data.hudGroups && typeof data.hudGroups === "object"
      ? data.hudGroups
      : ({} as Partial<Record<HudGroupId, boolean>>);
  // Earlier layouts stored climate=true even when researchHud=false hid it.
  // Honor that legacy gate once, then persist a single synchronized visible state.
  const climateVisible =
    typeof data.researchHud === "boolean"
      ? data.researchHud && visibility.climate !== false
      : visibility.climate === true;
  const independent = data.hudVisibilityVersion === HUD_VISIBILITY_VERSION;
  const touchVisible = typeof data.showTouchControls === "boolean"
    ? data.showTouchControls : data.drivingLayout !== "controller";
  const driveVisible = data.showDriveControls !== false;
  const hudGroups = Object.fromEntries(HUD_GROUPS.map((id) => {
    let shown = typeof visibility[id] === "boolean" ? visibility[id] : DEFAULT_HUD_GROUPS[id];
    if (id === "climate") shown = climateVisible;
    if (id === "ignition" && data.ignitionVisibility === "hidden") shown = false;
    if (!independent) {
      // Preserve what older layouts actually displayed, including child widgets
      // suppressed by a hidden parent. New switches never inherit those gates.
      if (id === "missions") shown = visibility.display !== false;
      if (id === "hazards") shown = climateVisible && visibility.hazards !== false;
      if (id === "performance") shown = climateVisible && data.climateHudSize !== "full";
      if (id === "stalks") shown = shown && visibility.wheel !== false;
      if ((TOUCH_HUD_GROUPS as readonly string[]).includes(id) && !touchVisible) shown = false;
      if ((DRIVE_HUD_GROUPS as readonly string[]).includes(id) && !driveVisible) shown = false;
    }
    return [id, shown];
  })) as Record<HudGroupId, boolean>;
  return {
    hudVisibilityVersion: HUD_VISIBILITY_VERSION,
    healthBars: sanitizeHealthBarMode(data.healthBars),
    notificationChannels:sanitizeNoticeChannels(data.notificationChannels),
    radioHudStyle:
      data.radioHudStyle === "streamlined" || data.radioHudStyle === "classic"
        ? data.radioHudStyle
        : "no-tabs",
    theme: isUITheme(data.theme) ? data.theme : "navy",
    menuHeaderStyle: data.menuHeaderStyle === "classic" ? "classic" : "angled",
    vehicleCosmetics: {matchCockpit:sanitizeVehicleCosmetics(data.vehicleCosmetics).matchCockpit},
    garageEffects: sanitizeGarageEffects(data.garageEffects),
    ignitionVisibility: data.ignitionVisibility === "hidden" ? "hidden" : "always",
    researchHud: hudGroups.climate,
    climateHudSize: data.climateHudSize === "full" || data.climateHudSize === "single" ? data.climateHudSize : "compact",
    parkingCrystals: data.parkingCrystals === true,
    parkingBrakeStyle: data.parkingBrakeStyle === "button" ? "button" : "lever",
    assistHudLayout: data.assistHudLayout === "extended" ? "extended" : "three",
    dashboardBrightness: numeric("dashboardBrightness", 0.1, 1),
    shiftLayout: data.shiftLayout === "automatic" ? "automatic" : "h-pattern",
    hudGroups,
    wheelDrop: numeric("wheelDrop", 0, 0.55),
    steeringTravel: numeric("steeringTravel", 0.9, 1.3),
    minimapScale: numeric("minimapScale", 0.5, 1.25),
    fov: numeric("fov", 55, 110),
    cameraSensitivity: numeric("cameraSensitivity", 0.25, 2),
    turretYawSensitivity:numeric("turretYawSensitivity",0.25,3),
    turretPitchSensitivity:numeric("turretPitchSensitivity",0.25,3),
    controllerDeadzone: numeric("controllerDeadzone", 0.05, 0.4),
    steeringSensitivity: numeric("steeringSensitivity", 0.5, 1.5),
    menuTextScale: numeric("menuTextScale", 1, 1.25),
    reducedMotion: data.reducedMotion === true,
    highContrast: data.highContrast === true,
    invertSteering: data.invertSteering === true,
    bindings,
    favoriteVehicles: Array.isArray(data.favoriteVehicles)
      ? data.favoriteVehicles
          .filter((id): id is string => typeof id === "string")
          .slice(0, 100)
      : [],
    touchLayout: data.touchLayout === "sticks" ? "sticks" : "pedals",
    drivingLayout:
      data.drivingLayout === "controller" ? "controller" : "standard",
    showTouchControls: hasTouchHud(hudGroups),
    showDriveControls: hasDriveHud(hudGroups),
    speedUnit: data.speedUnit === "mph" ? "mph" : "kmh",
  };
}
export const usePreferencesStore = create<
  Preferences & {
    update: (patch: PreferenceUpdate) => void;
    setHudGroup: (id: HudGroupId, visible: boolean) => void;
    toggleFavorite: (id: string) => void;
    resetControls: () => void;
  }
>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFERENCES,
      // Visibility edits merge the group map and synchronize the old climate
      // alias, so Settings and Research cannot disagree about what is shown.
      update: (patch) => {
        const state = get();
        const groups = { ...state.hudGroups };
        if (patch.showTouchControls !== undefined)
          for (const id of TOUCH_HUD_GROUPS) groups[id] = patch.showTouchControls;
        if (patch.showDriveControls !== undefined)
          for (const id of DRIVE_HUD_GROUPS) groups[id] = patch.showDriveControls;
        Object.assign(groups, patch.hudGroups);
        const climate = patch.researchHud ?? patch.hudGroups?.climate;
        if (climate !== undefined) groups.climate = climate;
        // Legacy "hidden" policies share the same visibility switch. Showing
        // the key again restores AUTO; AUTO/ALWAYS edits also reveal it.
        const ignitionVisibility =
          (patch.hudGroups?.ignition === true || patch.showDriveControls === true) &&
          patch.ignitionVisibility === undefined &&
          state.ignitionVisibility === "hidden"
            ? "always"
            : (patch.ignitionVisibility ?? state.ignitionVisibility);
        if (patch.ignitionVisibility !== undefined)
          groups.ignition = ignitionVisibility !== "hidden";
        const clean = sanitizePreferences({
          ...state,
          ...patch,
          ignitionVisibility,
          hudGroups: groups,
          garageEffects: { ...state.garageEffects, ...patch.garageEffects },
          vehicleCosmetics: { ...state.vehicleCosmetics, ...patch.vehicleCosmetics },
          researchHud: climate ?? groups.climate,
        });
        // Sanitizing creates new maps/arrays. Retain unchanged references so
        // a brightness drag cannot redraw the wheel, radio and entire HUD.
        const changed = Object.entries(clean).filter(
          ([key, value]) => !shallow(state[key as keyof Preferences], value),
        );
        if (changed.length) set(Object.fromEntries(changed));
      },
      setHudGroup: (id, visible) =>
        get().update({ hudGroups: { [id]: visible } }),
      toggleFavorite: (id) =>
        set((s) => ({
          favoriteVehicles: s.favoriteVehicles.includes(id)
            ? s.favoriteVehicles.filter((value) => value !== id)
            : [...s.favoriteVehicles, id],
        })),
      resetControls: () =>
        set({
          bindings: { ...DEFAULT_BINDINGS },
          controllerDeadzone: 0.12,
          steeringSensitivity: 1,
          invertSteering: false,
          cameraSensitivity: 1,
          turretYawSensitivity:1,
          turretPitchSensitivity:1,
        }),
    }),
    {
      name: "avenlab-preferences-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => sanitizePreferences(state),
      merge: (persisted, current) => ({
        ...current,
        ...sanitizePreferences(persisted),
      }),
    },
  ),
);
