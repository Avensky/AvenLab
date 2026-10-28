import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const DEFAULT_BINDINGS = { forward: "KeyW", reverse: "KeyS", left: "KeyA", right: "KeyD", brake: "Space", handbrake: "KeyB" };
export type BindingAction = keyof typeof DEFAULT_BINDINGS;
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
};
export const DEFAULT_PREFERENCES: Preferences = {
  fov: 75, cameraSensitivity: 1, controllerDeadzone: 0.12, steeringSensitivity: 1,
  invertSteering: false, reducedMotion: false, highContrast: false, menuTextScale: 1,
  bindings: DEFAULT_BINDINGS, favoriteVehicles: [], touchLayout: "pedals", speedUnit: "kmh",
  drivingLayout: "standard", showTouchControls: true, showDriveControls: true,
};
// Fixed shortcuts remain available; rebinding movement must never steal them.
export const RESERVED_KEYS = new Set(["F2", "F3", "F4", "F8", "Escape", "Enter", "Tab", "Backquote", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
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
  return {
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
  toggleFavorite: (id: string) => void;
  resetControls: () => void;
}>()(persist((set) => ({
  ...DEFAULT_PREFERENCES,
  update: (patch) => set((state) => sanitizePreferences({ ...state, ...patch })),
  toggleFavorite: (id) => set((s) => ({ favoriteVehicles: s.favoriteVehicles.includes(id) ? s.favoriteVehicles.filter((value) => value !== id) : [...s.favoriteVehicles, id] })),
  resetControls: () => set({ bindings: { ...DEFAULT_BINDINGS }, controllerDeadzone: 0.12, steeringSensitivity: 1, invertSteering: false, cameraSensitivity: 1 }),
}), {
  name: "avenlab-preferences-v1", version: 1,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => sanitizePreferences(state),
  merge: (persisted, current) => ({ ...current, ...sanitizePreferences(persisted) }),
}));
