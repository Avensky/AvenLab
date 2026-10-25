import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useWorldStore, type RenderMode } from "./worldStore";
import { useDebugViewStore } from "./debugViewStore";

export type VisualMode = RenderMode | "hidden";
export type RenderSettings = {
  environmentMode: VisualMode;
  vehicleOverrides: Record<string, VisualMode>;
  chunkOverrides: Record<string, VisualMode>;
  assetGlbs: Record<string, boolean>;
  dpr: number;
  shadows: boolean;
  reflections: boolean;
  stars: boolean;
  fog: boolean;
  vehicleLights: boolean;
  hud: boolean;
  overlay: boolean;
  autoVehicleAlignment: boolean;
};

// Driving starts with vehicle GLBs and a collider city. The collider-only
// benchmark remains an explicit preset in the debug menu.
export const BASELINE_SETTINGS: RenderSettings = {
  environmentMode: "collider", vehicleOverrides: {}, chunkOverrides: {}, assetGlbs: {},
  dpr: 1, shadows: false, reflections: false, stars: false, fog: false,
  vehicleLights: false, hud: false, overlay: false, autoVehicleAlignment: true,
};

type State = RenderSettings & {
  update: (settings: Partial<RenderSettings>) => void;
  setVehicleMode: (id: string, mode: VisualMode) => void;
  setChunkMode: (key: string, mode: VisualMode) => void;
  setAssetGlb: (key: string, enabled: boolean) => void;
  baseline: () => void;
  startSandbox: () => void;
};
export const useRenderSettingsStore = create<State>()(persist((set) => ({
  ...BASELINE_SETTINGS,
  update: (settings) => set(settings),
  setVehicleMode: (id, mode) => set((s) => ({ vehicleOverrides: { ...s.vehicleOverrides, [id]: mode } })),
  setChunkMode: (key, mode) => set((s) => ({
    chunkOverrides: { ...s.chunkOverrides, [key]: mode },
    assetGlbs: Object.fromEntries(Object.entries(s.assetGlbs).filter(([asset]) => !asset.startsWith(`${key}/`))),
  })),
  setAssetGlb: (key, enabled) => set((s) => ({ assetGlbs: { ...s.assetGlbs, [key]: enabled } })),
  startSandbox: () => {
    useWorldStore.getState().setMode("glb");
    useWorldStore.getState().setDebugMask(0);
    // Keep the driver's display choices; clear only session-specific overrides.
    set({ vehicleOverrides: {}, chunkOverrides: {}, assetGlbs: {} });
  },
  baseline: () => {
    useWorldStore.getState().setMode("collider");
    useWorldStore.getState().setDebugMask(0);
    useDebugViewStore.getState().setInterpolationEnabled(false);
    set({ ...BASELINE_SETTINGS, overlay: true });
  },
}), {
  name: "avenlab-display-v1", version: 1,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({ dpr: state.dpr, shadows: state.shadows, reflections: state.reflections,
    stars: state.stars, fog: state.fog, vehicleLights: state.vehicleLights, hud: state.hud,
    overlay: state.overlay, autoVehicleAlignment: state.autoVehicleAlignment, environmentMode: state.environmentMode }),
  merge: (persisted, current) => {
    const data = persisted && typeof persisted === "object" ? persisted as Partial<RenderSettings> : {};
    const merged = { ...current };
    for (const key of ["shadows", "reflections", "stars", "fog", "vehicleLights", "hud", "overlay", "autoVehicleAlignment"] as const) {
      if (typeof data[key] === "boolean") merged[key] = data[key];
    }
    if (data.dpr !== undefined && [0.5, 0.75, 1, 1.5, 2].includes(data.dpr)) merged.dpr = data.dpr;
    if (data.environmentMode && ["collider", "geometry", "glb", "hybrid", "hidden"].includes(data.environmentMode)) merged.environmentMode = data.environmentMode;
    return merged;
  },
}));
export const chunkKey = (x: number, z: number) => `${x},${z}`;

export const assetKey = (x: number, z: number, visual: string) => `${chunkKey(x, z)}/${visual}`;
