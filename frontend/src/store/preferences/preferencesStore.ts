/** Persisted device/accessibility preferences. Requests and vehicle physics live
 * elsewhere; this store owns only what the user sees and how input is mapped. */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isUITheme, type UITheme } from "../../theme/catalog";

export const DEFAULT_BINDINGS = {
  forward: "KeyW",
  reverse: "KeyS",
  left: "KeyA",
  right: "KeyD",
  brake: "Space",
  handbrake: "KeyB",
};
export type BindingAction = keyof typeof DEFAULT_BINDINGS;
import {
  HUD_GROUPS,
  DEFAULT_HUD_GROUPS,
  type HudGroupId,
} from "./hudVisibility";
// Stable exports for callers from the previous patch. New callers use index.ts.
export {
  HUD_GROUPS,
  DEFAULT_HUD_GROUPS,
  type HudGroupId,
} from "./hudVisibility";
export type Preferences = {
  theme: UITheme;
  ignitionVisibility: "auto" | "always" | "hidden";
  /** Compatibility alias for hudGroups.climate; actions keep both synchronized. */
  researchHud: boolean;
  /** Compact/full HVAC affects the driving widget; its cockpit page stays usable. */
  climateHudSize: "compact" | "full";
  parkingCrystals: boolean;
  parkingBrakeStyle: "lever" | "button";
  /** Three HUD switches by default; keep the expanded bank as a saved option. */
  assistHudLayout: "three" | "extended";
  fov: number;
  cameraSensitivity: number;
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
export const DEFAULT_PREFERENCES: Preferences = {
  theme: "navy",
  ignitionVisibility: "auto",
  researchHud: false,
  climateHudSize: "compact",
  parkingCrystals: false,
  parkingBrakeStyle: "lever",
  assistHudLayout: "three",
  fov: 75,
  cameraSensitivity: 1,
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
export const RESERVED_KEYS = new Set([
  "F2",
  "F3",
  "F4",
  "F8",
  "F9",
  "Escape",
  "Enter",
  "Tab",
  "Backquote",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyE",
  "KeyL",
  "KeyZ",
  "KeyX",
  "KeyH",
  "KeyQ",
  "KeyT",
  "KeyC",
  "KeyV",
  "KeyY",
  "KeyM",
  "KeyN",
  "KeyR",
  "ShiftLeft",
  "ShiftRight",
]);

// The persisted payload is treated as input, so old/corrupt settings cannot
// disable steering or inject an unbounded menu scale after a reload.
export function sanitizePreferences(value: unknown): Preferences {
  const data =
    value && typeof value === "object" ? (value as Partial<Preferences>) : {};
  const numeric = (key: keyof Preferences, min: number, max: number) =>
    typeof data[key] === "number" && Number.isFinite(data[key])
      ? Math.min(max, Math.max(min, data[key] as number))
      : (DEFAULT_PREFERENCES[key] as number);
  const proposed = { ...DEFAULT_BINDINGS, ...data.bindings };
  const keys = Object.values(proposed);
  const validBindings =
    keys.length === 6 &&
    new Set(keys).size === 6 &&
    keys.every(
      (code) =>
        typeof code === "string" &&
        /^(Key[A-Z]|Digit[0-9]|Space)$/.test(code) &&
        !RESERVED_KEYS.has(code),
    );
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
  return {
    theme: isUITheme(data.theme) ? data.theme : "navy",
    ignitionVisibility:
      data.ignitionVisibility === "always" ||
      data.ignitionVisibility === "hidden"
        ? data.ignitionVisibility
        : "auto",
    researchHud: climateVisible,
    climateHudSize: data.climateHudSize === "full" ? "full" : "compact",
    parkingCrystals: data.parkingCrystals === true,
    parkingBrakeStyle: data.parkingBrakeStyle === "button" ? "button" : "lever",
    assistHudLayout: data.assistHudLayout === "extended" ? "extended" : "three",
    shiftLayout: data.shiftLayout === "automatic" ? "automatic" : "h-pattern",
    hudGroups: Object.fromEntries(
      HUD_GROUPS.map((id) => [
        id,
        id === "climate"
          ? climateVisible
          : typeof visibility[id] === "boolean"
            ? visibility[id]
            : DEFAULT_HUD_GROUPS[id],
      ]),
    ) as Record<HudGroupId, boolean>,
    wheelDrop: numeric("wheelDrop", 0, 0.55),
    steeringTravel: numeric("steeringTravel", 0.9, 1.3),
    minimapScale: numeric("minimapScale", 0.5, 1.25),
    fov: numeric("fov", 55, 110),
    cameraSensitivity: numeric("cameraSensitivity", 0.25, 2),
    controllerDeadzone: numeric("controllerDeadzone", 0.05, 0.4),
    steeringSensitivity: numeric("steeringSensitivity", 0.5, 1.5),
    menuTextScale: numeric("menuTextScale", 1, 1.25),
    reducedMotion: data.reducedMotion === true,
    highContrast: data.highContrast === true,
    invertSteering: data.invertSteering === true,
    bindings: validBindings ? proposed : { ...DEFAULT_BINDINGS },
    favoriteVehicles: Array.isArray(data.favoriteVehicles)
      ? data.favoriteVehicles
          .filter((id): id is string => typeof id === "string")
          .slice(0, 100)
      : [],
    touchLayout: data.touchLayout === "sticks" ? "sticks" : "pedals",
    drivingLayout:
      data.drivingLayout === "controller" ? "controller" : "standard",
    showTouchControls:
      typeof data.showTouchControls === "boolean"
        ? data.showTouchControls
        : data.drivingLayout !== "controller",
    showDriveControls: data.showDriveControls !== false,
    speedUnit: data.speedUnit === "mph" ? "mph" : "kmh",
  };
}
export const usePreferencesStore = create<
  Preferences & {
    update: (patch: Partial<Preferences>) => void;
    setHudGroup: (id: HudGroupId, visible: boolean) => void;
    toggleFavorite: (id: string) => void;
    resetControls: () => void;
  }
>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      // Visibility edits merge the group map and synchronize the old climate
      // alias, so Settings and Research cannot disagree about what is shown.
      update: (patch) =>
        set((state) => {
          const groups = { ...state.hudGroups, ...patch.hudGroups };
          const climate = patch.researchHud ?? patch.hudGroups?.climate;
          return sanitizePreferences({
            ...state,
            ...patch,
            hudGroups: groups,
            ...(climate === undefined
              ? {}
              : { researchHud: climate, hudGroups: { ...groups, climate } }),
          });
        }),
      setHudGroup: (id, visible) =>
        set((s) => ({
          hudGroups: { ...s.hudGroups, [id]: visible },
          ...(id === "climate" ? { researchHud: visible } : {}),
        })),
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
