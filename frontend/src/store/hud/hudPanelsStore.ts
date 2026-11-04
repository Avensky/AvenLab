import { create } from "zustand";

/** Session layout only. Minimizing a widget never changes its visibility setting,
 * playback, HVAC requests or vehicle physics. Hidden panel contents unmount. */
export const useHudPanelsStore = create<{
  map: boolean;
  mapSessionKey: string | null;
  openMapForSession: (key: string | null) => void;
  radio: boolean;
  climate: boolean;
  toggle: (panel: "map" | "radio" | "climate") => void;
}>((set) => ({
  map: true,
  mapSessionKey: null,
  openMapForSession: (key) => set(state => key === state.mapSessionKey ? state : key === null ? {mapSessionKey:null} : {map:true,mapSessionKey:key}),
  radio: true,
  climate: true,
  toggle: (panel) => set((state) => ({ [panel]: !state[panel] })),
}));
