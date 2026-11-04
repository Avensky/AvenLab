import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CityQuality } from "../../world/cityLod";
import {
  isCityViewDistance,
  type CityViewDistance,
} from "../../world/cityViewDistance";
import { useWorldStore, type RenderMode } from "../world/worldStore";

export type VisualMode = RenderMode | "hidden";
export type RenderSettings = {
  cityQuality: CityQuality;
  cityViewDistance: CityViewDistance;
  environmentMode: VisualMode;
  vehicleOverrides: Record<string, VisualMode>;
  chunkOverrides: Record<string, VisualMode>;
  assetGlbs: Record<string, boolean>;
  dpr: number;
  shadows: boolean;
  reflections: boolean;
  vehicleLights: boolean;
  hud: boolean;
  overlay: boolean;
  autoVehicleAlignment: boolean;
  opaqueCityMaterials: boolean;
};

// Driving starts with vehicle GLBs and a collider city. The collider-only
// benchmark remains an explicit preset in the debug menu.
export const BASELINE_SETTINGS: RenderSettings = {
  cityQuality: "fast",
  cityViewDistance: "auto",
  environmentMode: "collider",
  vehicleOverrides: {},
  chunkOverrides: {},
  assetGlbs: {},
  dpr: 1,
  shadows: false,
  reflections: false,
  vehicleLights: false,
  hud: false,
  overlay: false,
  autoVehicleAlignment: true,
  opaqueCityMaterials: false,
};

const detailKeys = ["cityQuality","cityViewDistance","environmentMode","dpr","shadows","reflections","vehicleLights"] as const;
type DetailSettings = Pick<RenderSettings, typeof detailKeys[number]>;
function detailSettings(s: RenderSettings): DetailSettings {
  const {cityQuality,cityViewDistance,environmentMode,dpr,shadows,reflections,vehicleLights}=s;
  return {cityQuality,cityViewDistance,environmentMode,dpr,shadows,reflections,vehicleLights};
}
const LOW_DETAIL: DetailSettings = {
  cityQuality:"fast",cityViewDistance:250,environmentMode:"glb",dpr:0.75,
  shadows:false,reflections:false,vehicleLights:false,
};

type State = RenderSettings & {
  lowDetail: boolean;
  savedDetail: DetailSettings | null;
  beforeBenchmark: (Pick<RenderSettings,"hud"|"overlay"|"autoVehicleAlignment"|"opaqueCityMaterials"> & {mode:RenderMode}) | null;
  restoreFullDetail: () => void;
  update: (settings: Partial<RenderSettings>) => void;
  setVehicleMode: (id: string, mode: VisualMode) => void;
  setChunkMode: (key: string, mode: VisualMode) => void;
  setAssetGlb: (key: string, enabled: boolean) => void;
  baseline: () => void;
  startSandbox: () => void;
  cityPerformancePreset: () => void;
};
export const useRenderSettingsStore = create<State>()(
  persist(
    (set,get) => ({
      ...BASELINE_SETTINGS,
      lowDetail:false, savedDetail:null, beforeBenchmark:null,
      restoreFullDetail: () => {
        const {savedDetail,beforeBenchmark}=get();
        if(!savedDetail)return;
        if(beforeBenchmark){
          const {mode,...options}=beforeBenchmark;
          useWorldStore.getState().setMode(mode);
          set({...options,...savedDetail,lowDetail:false,savedDetail:null,beforeBenchmark:null});
        }else set({...savedDetail,lowDetail:false,savedDetail:null});
      },
      update: (patch) => {
        const saved=get().savedDetail;
        // Editing a quality option explicitly resumes the user's full profile.
        if(saved && detailKeys.some(key=>key in patch))get().restoreFullDetail();
        set(patch);
      },
      setVehicleMode: (id, mode) =>
        set((s) => ({
          vehicleOverrides: { ...s.vehicleOverrides, [id]: mode },
        })),
      setChunkMode: (key, mode) =>
        set((s) => ({
          chunkOverrides: { ...s.chunkOverrides, [key]: mode },
          assetGlbs: Object.fromEntries(
            Object.entries(s.assetGlbs).filter(
              ([asset]) => !asset.startsWith(`${key}/`),
            ),
          ),
        })),
      setAssetGlb: (key, enabled) =>
        set((s) => ({ assetGlbs: { ...s.assetGlbs, [key]: enabled } })),
      cityPerformancePreset: () => {
        useWorldStore.getState().setMode("glb");
        useWorldStore.getState().setDebugMask(0);
        set({
          ...LOW_DETAIL, dpr:Math.min(LOW_DETAIL.dpr,get().dpr), lowDetail:true, savedDetail:get().savedDetail??detailSettings(get()),
          chunkOverrides:{},assetGlbs:{},vehicleOverrides:{},
        });
      },
      startSandbox: () => {
        useWorldStore.getState().setMode("glb");
        useWorldStore.getState().setDebugMask(0);
        // Keep the driver's display choices; clear only session-specific overrides.
        set({ vehicleOverrides: {}, chunkOverrides: {}, assetGlbs: {} });
      },
      baseline: () => {
        const s=get();
        const beforeBenchmark=s.beforeBenchmark??{mode:useWorldStore.getState().mode,hud:s.hud,overlay:s.overlay,
          autoVehicleAlignment:s.autoVehicleAlignment,opaqueCityMaterials:s.opaqueCityMaterials};
        useWorldStore.getState().setMode("collider");
        useWorldStore.getState().setDebugMask(0);
        // A graphics comparison must not overwrite the driver's smoothing choice.
        set({ ...BASELINE_SETTINGS, overlay:true, lowDetail:false, savedDetail:s.savedDetail??detailSettings(s), beforeBenchmark });
      },
    }),
    {
      name: "avenlab-display-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        cityQuality: state.cityQuality,
        cityViewDistance: state.cityViewDistance,
        dpr: state.dpr,
        shadows: state.shadows,
        reflections: state.reflections,
        vehicleLights: state.vehicleLights,
        hud: state.beforeBenchmark?.hud??state.hud,
        overlay: state.beforeBenchmark?.overlay??state.overlay,
        autoVehicleAlignment: state.beforeBenchmark?.autoVehicleAlignment??state.autoVehicleAlignment,
        opaqueCityMaterials: state.beforeBenchmark?.opaqueCityMaterials??state.opaqueCityMaterials,
        environmentMode: state.environmentMode,
        // Store the original profile in the existing, validated v1 fields.
        ...state.savedDetail, lowDetail:state.lowDetail,
      }),
      merge: (persisted, current) => {
        const data =
          persisted && typeof persisted === "object"
            ? (persisted as Partial<RenderSettings> & {lowDetail?:boolean})
            : {};
        const merged: State = { ...current, ...detailSettings(BASELINE_SETTINGS),
          lowDetail:false, savedDetail:null, beforeBenchmark:null };
        if (
          data.cityQuality &&
          ["fast", "balanced", "original"].includes(data.cityQuality)
        )
          merged.cityQuality = data.cityQuality;
        if (isCityViewDistance(data.cityViewDistance))
          merged.cityViewDistance = data.cityViewDistance;
        for (const key of [
          "shadows",
          "reflections",
          "vehicleLights",
          "hud",
          "overlay",
          "autoVehicleAlignment",
          "opaqueCityMaterials",
        ] as const) {
          if (typeof data[key] === "boolean") merged[key] = data[key];
        }
        if (data.dpr !== undefined && [0.5, 0.75, 1, 1.5, 2].includes(data.dpr))
          merged.dpr = data.dpr;
        if (
          data.environmentMode &&
          ["collider", "geometry", "glb", "hybrid", "hidden"].includes(
            data.environmentMode,
          )
        )
          merged.environmentMode = data.environmentMode;
        return data.lowDetail===true ? {...merged,...LOW_DETAIL,dpr:Math.min(LOW_DETAIL.dpr,merged.dpr),lowDetail:true,savedDetail:detailSettings(merged)} : merged;
      },
    },
  ),
);
export const chunkKey = (x: number, z: number) => `${x},${z}`;

export const assetKey = (x: number, z: number, visual: string) =>
  `${chunkKey(x, z)}/${visual}`;
