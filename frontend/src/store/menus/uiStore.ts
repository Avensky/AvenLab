import { create } from "zustand";
import { useInputStore } from "../input/inputStore";

import { createMenuActions } from "./menuActions";
import { isDrivingScreen, type SignalMission, type UIState } from "./types";
export type * from "./types";
export { isDrivingScreen } from "./types";
export const useUIStore = create<UIState>()((set, get, api) => ({
  ...createMenuActions(set, get, api),
  settingsTab: "display",
  settingsParent: null,
  openSettings: (settingsTab = "display") =>
    set({
      overlay: "settings",
      settingsTab,
      settingsParent: get().overlay === "cockpit" ? "cockpit" : null,
    }),
  cockpitTab: "drive",
  setCockpitTab: (cockpitTab) => set({ cockpitTab }),
  openCockpit: (cockpitTab = "drive") => {
    if (isDrivingScreen(get().screen) && !get().isModeLoading)
      set({ overlay: "cockpit", cockpitTab });
  },
  screen: "main",
  setScreen: (screen) => {
    set({
      screen,
      overlay: null,
      vehicleSelectionParent: null,
      settingsParent: null,
    });
  },
  overlay: null,
  debugMenuParent: "pause",
  toggleDebugMenu: () => {
    const state = get();
    if (!isDrivingScreen(state.screen) || state.isModeLoading) return;
    if (state.overlay === "debug_menu") get().backToParentMenu();
    else if (state.overlay === null || state.overlay === "pause")
      get().setOverlay("debug_menu");
  },
  vehicleSelectionParent: null,
  openVehicleSelection: () => {
    const state = get();
    if (
      !isDrivingScreen(state.screen) ||
      state.isModeLoading ||
      (state.overlay !== null && state.overlay !== "pause")
    )
      return;
    set({ overlay: "vehicle_select", vehicleSelectionParent: state.overlay });
  },
  setOverlay: (overlay) => {
    if (overlay === "debug_menu") {
      const state = get();
      if (!isDrivingScreen(state.screen)) return;
      if (state.overlay !== "debug_menu")
        set({
          overlay,
          debugMenuParent: state.overlay === "pause" ? "pause" : null,
        });
      return;
    }
    if (overlay === "vehicle_select") {
      get().openVehicleSelection();
      return;
    }
    if (
      overlay &&
      [
        "pause",
        "debug_menu",
        "vehicle_select",
        "leave_game",
        "cockpit",
        "world_builder",
      ].includes(overlay) &&
      !isDrivingScreen(get().screen)
    )
      return;
    set({ overlay });
  },
  selectedMenuIndexById: {
    main: 0,
    pause: 0,
    settings: 0,
    sandbox_setup: 0,
    signal_recon_setup: 0,
  },

  isModeLoading: false,
  loadingLabel: "Loading...",
  loadingProgress: 0,
  startModeLoading: (screen, label = "Loading...") =>
    set({
      screen,
      overlay: null,
      isModeLoading: true,
      loadingLabel: label,
      loadingProgress: 1,
    }),
  setLoadingProgress: (value) =>
    set({
      loadingProgress: Math.max(0, Math.min(100, value)),
    }),
  finishModeLoading: () =>
    set({
      isModeLoading: false,
      loadingProgress: 100,
    }),

  openPause: () => {
    const { screen } = get();
    if (!isDrivingScreen(screen)) return;

    set({ overlay: "pause" });
  },
  closeOverlay: () => {
    set({ overlay: null, vehicleSelectionParent: null, settingsParent: null });
  },
  backToParentMenu: () => {
    if (get().overlay === "settings" && get().settingsParent === "cockpit")
      set({ overlay: "cockpit", settingsParent: null });
    else if (get().overlay === "debug_menu")
      set({ overlay: get().debugMenuParent, debugMenuParent: "pause" });
    else if (get().overlay === "vehicle_select")
      set({
        overlay: get().vehicleSelectionParent,
        vehicleSelectionParent: null,
      });
    else if (get().overlay !== null)
      set({ overlay: isDrivingScreen(get().screen) ? "pause" : null });
    else set({ screen: "main", overlay: null });
  },
  togglePauseMenu: () => {
    const { screen, overlay } = get();

    if (!isDrivingScreen(screen)) return;

    set({
      overlay: overlay === "pause" ? null : "pause",
    });
  },
  selectedMission: null,
  setSelectedMission: (mission: SignalMission | null) =>
    set({ selectedMission: mission }),
}));

// Route changes, including Escape, controller Start, pointer clicks and child
// menus, have one brake policy. Multiplayer keeps simulating while menus open.
// This subscription is event-driven; it introduces no polling or extra sender.
let pauseBrakeHeld = false;
const stopMenuBrake = useUIStore.subscribe((state) => {
  if (
    state.screen !== "sandbox" ||
    state.overlay === null ||
    state.isModeLoading
  )
    pauseBrakeHeld = false;
  else if (state.overlay === "pause" || state.overlay === "world_builder")
    pauseBrakeHeld = true;
  // Child menus retain a pause hold. Opening the physical cockpit directly
  // does not invent a service-brake request during an electronics experiment.
  useInputStore.getState().setMenuBrake(pauseBrakeHeld);
});
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    stopMenuBrake();
    useInputStore.getState().setMenuBrake(false);
  });
