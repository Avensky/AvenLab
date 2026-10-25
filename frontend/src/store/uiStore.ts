import { create } from "zustand";
import { useSelectionStore } from "./selectionStore";
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

export type UIOverlay = null | "pause" | "debug_menu" | "settings" | "vehicle_select" | "career" | "missions" | "leave_game";

export type MenuId = "main" | "pause" | "settings" | "sandbox_setup" | "signal_recon_setup";

// Only Sandbox owns driving controls and the in-game pause stack.
export const isDrivingScreen = (screen: MenuScreen) => screen === "sandbox";

const menuItemCounts: Record<MenuId, number> = {
  main: MAIN_MENU_ITEMS.length,
  pause: PAUSE_MENU_ITEMS.length,
  settings: 3,
  sandbox_setup: 4,
  signal_recon_setup: 2,
};

function getActiveMenu(screen: MenuScreen, overlay: UIOverlay): MenuId | null {
  if (overlay === "pause" && isDrivingScreen(screen)) return "pause";
  if (overlay !== null) return null;
  if (screen === "main") return "main";
  if (screen === "sandbox_setup") return "sandbox_setup";
  return null;
}

type SignalMission = {
  id: string;
  title: string;
  target: string;
  status: string;
};

type UIState = {
  screen: MenuScreen;
  setScreen: (screen: MenuScreen) => void;

  overlay: UIOverlay;
  setOverlay: (overlay: UIOverlay) => void;

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
  screen: "main",
  setScreen: (screen) => { set({ screen, overlay: null, }); },
  overlay: null,
  setOverlay: (overlay) => {
    if (overlay && ["pause", "debug_menu", "vehicle_select", "leave_game"].includes(overlay) && !isDrivingScreen(get().screen)) return;
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
      if (item) set({ overlay: item.id === "resume" ? null : item.id });
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
        set({
          screen: "sandbox",
          overlay: null,
        });
        return;
      }

      if (index === 3) {
        set({
          screen: "main",
          overlay: null,
        });
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
    set({ overlay: null });
  },
  backToParentMenu: () => {
    if (get().overlay !== null) set({ overlay: isDrivingScreen(get().screen) ? "pause" : null });
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