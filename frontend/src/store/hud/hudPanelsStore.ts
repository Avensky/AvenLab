import { create } from "zustand";

/** Session layout only. Minimizing a widget never changes its visibility setting,
 * playback, HVAC requests or vehicle physics. Hidden panel contents unmount. */
export const useHudPanelsStore = create<{
  map: boolean;
  radio: boolean;
  climate: boolean;
  toggle: (panel: "map" | "radio" | "climate") => void;
}>((set) => ({
  map: false,
  radio: true,
  climate: true,
  toggle: (panel) => set((state) => ({ [panel]: !state[panel] })),
}));
