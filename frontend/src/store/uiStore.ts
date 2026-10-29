import { create } from "zustand";
import { useSelectionStore } from "./selectionStore";
import { CAN_INTERFACE_OPTIONS, CAN_MODE_OPTIONS, useCanBusStore } from "./canBusStore";
import { MAIN_MENU_ITEMS, PAUSE_MENU_ITEMS } from "../game/menuItems";

export type MenuScreen =
  | "loading"
  | "main"
  | "sandbox_setup"
  | "sandbox"
  | "signal_recon"
  | "signal_recon_setup"
  | "signal_recon_mission"
  | "swarm"
  | "settings"
  | "vehicle_select"
  | "career"
  | "missions";

export type UIOverlay = null | "pause" | "debug_menu" | "settings" | "vehicle_select" | "career" | "missions" | "leave_game" | "cockpit" | "world_builder";
export type CockpitTab = "drive" | "lights" | "wipers" | "cruise" | "radio" | "vehicle" | "console" | "ignition" | "navigation";

export type MenuId = "main" | "pause" | "settings" | "sandbox_setup" | "signal_recon_setup";

// Only Sandbox owns driving controls and the in-game pause stack.
export const isDrivingScreen = (screen: MenuScreen) => screen === "sandbox";

const menuItemCounts: Record<MenuId, number> = {
  main: MAIN_MENU_ITEMS.length,
  pause: PAUSE_MENU_ITEMS.length,
  settings: 3,
  sandbox_setup: 4,
  signal_recon_setup: 5,
};

function getActiveMenu(screen: MenuScreen, overlay: UIOverlay): MenuId | null {
  if (overlay === "pause" && isDrivingScreen(screen)) return "pause";
  if (overlay !== null) return null;
  if (screen === "main") return "main";
  if (screen === "sandbox_setup") return "sandbox_setup";
  if (screen === "signal_recon_setup") return "signal_recon_setup";
  return null;
}

type SignalMission = {
  id: string;
  title: string;
  target: string;
  status: string;
};

type UIState = {
  settingsTab:string;
  openSettings:(tab?:string)=>void;
  cockpitTab: CockpitTab;
  setCockpitTab: (tab: CockpitTab) => void;
  openCockpit: (tab?: CockpitTab) => void;
  screen: MenuScreen;
  setScreen: (screen: MenuScreen) => void;

  overlay: UIOverlay;
  setOverlay: (overlay: UIOverlay) => void;
  vehicleSelectionParent: "pause" | null;
  openVehicleSelection: () => void;
  debugMenuParent: "pause" | null;
  toggleDebugMenu: () => void;

  selectedMenuIndexById: Record<MenuId, number>;

  isModeLoading: boolean;
  startModeLoading: (screen: MenuScreen, label?: string) => void;

  loadingLabel: string;
  finishModeLoading: () => void;

  loadingProgress: number;
  setLoadingProgress: (value: number) => void;

  getActiveMenuId: () => MenuId | null;
  getActiveMenuIndex: () => number;
  setActiveMenuIndex: (index: number) => void;

  moveActiveMenuSelection: (dir: 1 | -1) => void;
  activateActiveMenuSelection: () => void;

  openPause: () => void;
  closeOverlay: () => void;
  backToParentMenu: () => void;
  togglePauseMenu: () => void;

  moveActiveMenuHorizontal: (dir: 1 | -1) => void;

  selectedMission: SignalMission | null;
  setSelectedMission: (mission: SignalMission | null) => void;

};


export const useUIStore = create<UIState>((set, get) => ({
  settingsTab:"display",
  openSettings:(settingsTab="display")=>set({overlay:"settings",settingsTab}),
  cockpitTab: "drive",
  setCockpitTab: (cockpitTab) => set({ cockpitTab }),
  openCockpit: (cockpitTab = "drive") => { if (isDrivingScreen(get().screen) && !get().isModeLoading) set({ overlay: "cockpit", cockpitTab }); },
  screen: "main",
  setScreen: (screen) => { set({ screen, overlay: null, vehicleSelectionParent: null }); },
  overlay: null,
  debugMenuParent: "pause",
  toggleDebugMenu: () => {
    const state = get();
    if (!isDrivingScreen(state.screen) || state.isModeLoading) return;
    if (state.overlay === "debug_menu") get().backToParentMenu();
    else if (state.overlay === null || state.overlay === "pause") get().setOverlay("debug_menu");
  },
  vehicleSelectionParent: null,
  openVehicleSelection: () => {
    const state = get();
    if (!isDrivingScreen(state.screen) || state.isModeLoading
      || (state.overlay !== null && state.overlay !== "pause")) return;
    set({ overlay: "vehicle_select", vehicleSelectionParent: state.overlay });
  },
  setOverlay: (overlay) => {
    if (overlay === "debug_menu") {
      const state = get();
      if (!isDrivingScreen(state.screen)) return;
      if (state.overlay !== "debug_menu") set({ overlay, debugMenuParent: state.overlay === "pause" ? "pause" : null });
      return;
    }
    if (overlay === "vehicle_select") { get().openVehicleSelection(); return; }
    if (overlay && ["pause", "debug_menu", "vehicle_select", "leave_game", "cockpit", "world_builder"].includes(overlay) && !isDrivingScreen(get().screen)) return;
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

  getActiveMenuId: () => {
    const { screen, overlay } = get();
    return getActiveMenu(screen, overlay);
  },

  getActiveMenuIndex: () => {
    const activeMenu = get().getActiveMenuId();
    if (!activeMenu) return 0;

    return get().selectedMenuIndexById[activeMenu] ?? 0;
  },

  setActiveMenuIndex: (index) => {
    const activeMenu = get().getActiveMenuId();
    if (!activeMenu) return;

    const count = menuItemCounts[activeMenu];
    const safeIndex = Math.max(0, Math.min(index, count - 1));

    set({
      selectedMenuIndexById: {
        ...get().selectedMenuIndexById,
        [activeMenu]: safeIndex,
      },
    });
  },

  moveActiveMenuSelection: (dir) => {
    const activeMenu = get().getActiveMenuId();
    if (!activeMenu) return;

    const count = menuItemCounts[activeMenu];
    const current = get().selectedMenuIndexById[activeMenu] ?? 0;
    const next = (current + dir + count) % count;

    set({
      selectedMenuIndexById: {
        ...get().selectedMenuIndexById,
        [activeMenu]: next,
      },
    });
  },

  activateActiveMenuSelection: () => {
    const activeMenu = get().getActiveMenuId();
    if (!activeMenu) return;

    const index = get().selectedMenuIndexById[activeMenu] ?? 0;

    if (activeMenu === "main") {
      const item = MAIN_MENU_ITEMS[index];
      if (item?.available) set({ screen: item.screen, overlay: null });
      return;
    }

    if (activeMenu === "pause") {
      const item = PAUSE_MENU_ITEMS[index];
      if (item) get().setOverlay(item.id === "resume" ? null : item.id);
      return;
    }

    if (activeMenu === "signal_recon_setup") {
      if (index < 3) get().moveActiveMenuHorizontal(1);
      // The setup component owns validation and copying the selected CAN identity.
      else if (index === 3) window.dispatchEvent(new Event("avenlab:signal-recon-start"));
      else if (index === 4) get().setScreen("main");
      return;
    }

    if (activeMenu === "sandbox_setup") {
      if (index === 0) {
        useSelectionStore.getState().nextVehicle();
        return;
      }

      if (index === 1) {
        useSelectionStore.getState().nextMap();
        return;
      }

      if (index === 2) {
        // The setup component owns server validation and the spawn request.
        window.dispatchEvent(new Event("avenlab:sandbox-start"));
        return;
      }

      if (index === 3) {
        window.dispatchEvent(new Event("avenlab:sandbox-exit"));
        return;
      }
    }

  },
  openPause: () => {
    const { screen } = get();
    if (!isDrivingScreen(screen)) return;

    set({ overlay: "pause" });
  },
  closeOverlay: () => {
    set({ overlay: null, vehicleSelectionParent: null });
  },
  backToParentMenu: () => {
    if (get().overlay === "debug_menu") set({ overlay: get().debugMenuParent, debugMenuParent: "pause" });
    else if (get().overlay === "vehicle_select") set({ overlay: get().vehicleSelectionParent, vehicleSelectionParent: null });
    else if (get().overlay !== null) set({ overlay: isDrivingScreen(get().screen) ? "pause" : null });
    else set({ screen: "main", overlay: null });
  },
  togglePauseMenu: () => {
    const { screen, overlay } = get();

    if (!isDrivingScreen(screen)) return;

    set({
      overlay: overlay === "pause" ? null : "pause",
    });
  },
  moveActiveMenuHorizontal: (dir) => {
    const activeMenu = get().getActiveMenuId();
    if (!activeMenu) return;

    const index = get().selectedMenuIndexById[activeMenu] ?? 0;

    if (activeMenu === "signal_recon_setup") {
      const selection = useSelectionStore.getState();
      const bus = useCanBusStore.getState();
      if (index === 0) {
        const current = CAN_INTERFACE_OPTIONS.indexOf(bus.selectedInterface);
        bus.setSelectedInterface(CAN_INTERFACE_OPTIONS[(current + dir + CAN_INTERFACE_OPTIONS.length) % CAN_INTERFACE_OPTIONS.length]);
      } else if (index === 1) {
        const current = CAN_MODE_OPTIONS.indexOf(bus.selectedMode);
        bus.setSelectedMode(CAN_MODE_OPTIONS[(current + dir + CAN_MODE_OPTIONS.length) % CAN_MODE_OPTIONS.length]);
      } else if (index === 2) {
        if (dir === 1) selection.nextVehicle(); else selection.prevVehicle();
      }
      return;
    }

    if (activeMenu === "sandbox_setup") {
      const selection = useSelectionStore.getState();

      if (index === 0) {
        // dir === 1 ? selection.nextVehicle() : selection.prevVehicle();
        if (dir === 1) {
          selection.nextVehicle();
        } else {
          selection.prevVehicle();
        }
        return;
      }

      if (index === 1) {
        // dir === 1 ? selection.nextMap() : selection.nextMap();
        if (dir === 1) {
          selection.nextMap();
        } else {
          selection.prevMap();
        }
        return;
      }
    }
  },

  selectedMission: null,
  setSelectedMission: (mission: SignalMission | null) => set({ selectedMission: mission }),

}));
