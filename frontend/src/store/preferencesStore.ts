import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const DEFAULT_BINDINGS = { forward: "KeyW", reverse: "KeyS", left: "KeyA", right: "KeyD", brake: "Space", handbrake: "KeyB" };
export type BindingAction = keyof typeof DEFAULT_BINDINGS;
export const HUD_GROUPS = ["gauges", "wheel", "pedals", "ignition", "display", "climate", "shifter", "parking", "assists", "minimap", "chat"] as const;
export type HudGroupId = typeof HUD_GROUPS[number];
export const DEFAULT_HUD_GROUPS: Record<HudGroupId, boolean> = {gauges:true,wheel:true,pedals:true,ignition:true,display:true,climate:true,shifter:true,parking:true,assists:true,minimap:true,chat:true};
export type Preferences = {
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
  fov: 75, cameraSensitivity: 1, controllerDeadzone: 0.12, steeringSensitivity: 1,
  invertSteering: false, reducedMotion: false, highContrast: false, menuTextScale: 1,
  bindings: DEFAULT_BINDINGS, favoriteVehicles: [], touchLayout: "pedals", speedUnit: "kmh",
  drivingLayout: "standard", showTouchControls: true, showDriveControls: true,
  shiftLayout: "h-pattern", hudGroups: DEFAULT_HUD_GROUPS, wheelDrop: .28, steeringTravel: 1.12, minimapScale: .75,
};
// Fixed shortcuts remain available; rebinding movement must never steal them.
export const RESERVED_KEYS = new Set(["F2", "F3", "F4", "F8", "F9", "Escape", "Enter", "Tab", "Backquote", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "KeyE", "KeyL", "KeyZ", "KeyX", "KeyH", "KeyQ", "KeyT", "KeyC", "KeyV", "KeyY", "KeyM", "KeyN", "KeyR", "ShiftLeft", "ShiftRight"]);

// The persisted payload is treated as input, so old/corrupt settings cannot
// disable steering or inject an unbounded menu scale after a reload.
export function sanitizePreferences(value: unknown): Preferences {
  const data = value && typeof value === "object" ? value as Partial<Preferences> : {};
  const numeric = (key: keyof Preferences, min: number, max: number) => typeof data[key] === "number" && Number.isFinite(data[key])
    ? Math.min(max, Math.max(min, data[key] as number)) : DEFAULT_PREFERENCES[key] as number;
  const proposed = { ...DEFAULT_BINDINGS, ...data.bindings };
  const keys = Object.values(proposed);
  const validBindings = keys.length === 6 && new Set(keys).size === 6 && keys.every((code) => typeof code === "string" && /^(Key[A-Z]|Digit[0-9]|Space)$/.test(code) && !RESERVED_KEYS.has(code));
  const visibility=data.hudGroups&&typeof data.hudGroups==="object"?data.hudGroups:{} as Partial<Record<HudGroupId,boolean>>;
  return {
    shiftLayout: data.shiftLayout === "automatic" ? "automatic" : "h-pattern",
    hudGroups: Object.fromEntries(HUD_GROUPS.map(id=>[id,typeof visibility[id]==="boolean"?visibility[id]:true])) as Record<HudGroupId,boolean>,
    wheelDrop: numeric("wheelDrop",0,.55), steeringTravel: numeric("steeringTravel",.9,1.3),
    minimapScale: numeric("minimapScale",.5,1.25),
    fov: numeric("fov", 55, 110), cameraSensitivity: numeric("cameraSensitivity", 0.25, 2),
    controllerDeadzone: numeric("controllerDeadzone", 0.05, 0.4), steeringSensitivity: numeric("steeringSensitivity", 0.5, 1.5),
    menuTextScale: numeric("menuTextScale", 1, 1.25), reducedMotion: data.reducedMotion === true,
    highContrast: data.highContrast === true, invertSteering: data.invertSteering === true,
    bindings: validBindings ? proposed : { ...DEFAULT_BINDINGS },
    favoriteVehicles: Array.isArray(data.favoriteVehicles) ? data.favoriteVehicles.filter((id): id is string => typeof id === "string").slice(0, 100) : [],
    touchLayout: data.touchLayout === "sticks" ? "sticks" : "pedals",
    drivingLayout: data.drivingLayout === "controller" ? "controller" : "standard",
    showTouchControls: typeof data.showTouchControls === "boolean" ? data.showTouchControls : data.drivingLayout !== "controller",
    showDriveControls: data.showDriveControls !== false,
    speedUnit: data.speedUnit === "mph" ? "mph" : "kmh",
  };
}
export const usePreferencesStore = create<Preferences & {
  update: (patch: Partial<Preferences>) => void;
  setHudGroup: (id: HudGroupId, visible: boolean) => void;
  toggleFavorite: (id: string) => void;
  resetControls: () => void;
}>()(persist((set) => ({
  ...DEFAULT_PREFERENCES,
  update: (patch) => set((state) => sanitizePreferences({ ...state, ...patch })),
  setHudGroup: (id,visible) => set(s=>({hudGroups:{...s.hudGroups,[id]:visible}})),
  toggleFavorite: (id) => set((s) => ({ favoriteVehicles: s.favoriteVehicles.includes(id) ? s.favoriteVehicles.filter((value) => value !== id) : [...s.favoriteVehicles, id] })),
  resetControls: () => set({ bindings: { ...DEFAULT_BINDINGS }, controllerDeadzone: 0.12, steeringSensitivity: 1, invertSteering: false, cameraSensitivity: 1 }),
}), {
  name: "avenlab-preferences-v1", version: 1,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => sanitizePreferences(state),
  merge: (persisted, current) => ({ ...current, ...sanitizePreferences(persisted) }),
}));
