import { create } from "zustand";
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
};

// Every reload starts lean. No GLB, HDR or diagnostic request is needed to drive.
export const BASELINE_SETTINGS: RenderSettings = {
  environmentMode: "collider", vehicleOverrides: {}, chunkOverrides: {}, assetGlbs: {},
  dpr: 1, shadows: false, reflections: false, stars: false, fog: false,
  vehicleLights: false, hud: false, overlay: false,
};

type State = RenderSettings & {
  update: (settings: Partial<RenderSettings>) => void;
  setVehicleMode: (id: string, mode: VisualMode) => void;
  setChunkMode: (key: string, mode: VisualMode) => void;
  setAssetGlb: (key: string, enabled: boolean) => void;
  baseline: () => void;
};
export const useRenderSettingsStore = create<State>((set) => ({
  ...BASELINE_SETTINGS,
  update: (settings) => set(settings),
  setVehicleMode: (id, mode) => set((s) => ({ vehicleOverrides: { ...s.vehicleOverrides, [id]: mode } })),
  setChunkMode: (key, mode) => set((s) => ({
    chunkOverrides: { ...s.chunkOverrides, [key]: mode },
    assetGlbs: Object.fromEntries(Object.entries(s.assetGlbs).filter(([asset]) => !asset.startsWith(`${key}/`))),
  })),
  setAssetGlb: (key, enabled) => set((s) => ({ assetGlbs: { ...s.assetGlbs, [key]: enabled } })),
  baseline: () => {
    useWorldStore.getState().setMode("collider");
    useWorldStore.getState().setDebugMask(0);
    useDebugViewStore.getState().setInterpolationEnabled(false);
    set({ ...BASELINE_SETTINGS, overlay: true });
  },
}));
export const chunkKey = (x: number, z: number) => `${x},${z}`;

export const assetKey = (x: number, z: number, visual: string) => `${chunkKey(x, z)}/${visual}`;
