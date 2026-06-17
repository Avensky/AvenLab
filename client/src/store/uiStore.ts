import { create } from "zustand";
import { useSelectionStore } from "./selectionStore";

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
  | "vehicle_select";

export type UIOverlay = null | "pause" | "debug_menu" | "settings" | "vehicle_select";

export type MenuId = "main" | "pause" | "settings" | "sandbox_setup" | "signal_recon_setup";

const playableScreens = new Set<MenuScreen>([
  "sandbox",
  "swarm",
  "signal_recon",
]);

const menuItemCounts: Record<MenuId, number> = {
  main: 4,
  pause: 4,
  settings: 3,
  sandbox_setup: 4,
  signal_recon_setup: 2,
};

function getActiveMenu(screen: MenuScreen, overlay: UIOverlay): MenuId | null {
  if (overlay === "pause") return "pause";
  if (overlay === "settings") return "settings";
  if (screen === "main") return "main";
  if (screen === "settings") return "settings";
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
  togglePauseMenu: () => void;

  moveActiveMenuHorizontal: (dir: 1 | -1) => void;

  selectedMission: SignalMission | null;
  setSelectedMission: (mission: SignalMission | null) => void;

};


export const useUIStore = create<UIState>((set, get) => ({
  screen: "main",
  setScreen: (screen) => { set({ screen, overlay: null, }); },
  overlay: null,
  setOverlay: (overlay) => { set({ overlay }); },
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
      const targets: MenuScreen[] = [
        "sandbox_setup",
        "signal_recon",
        "swarm",
        "settings",
      ];

      set({
        screen: targets[index] ?? "sandbox",
        overlay: null,
      });

      return;
    }

    if (activeMenu === "pause") {
      if (index === 0) {
        set({ overlay: null });
        return;
      }

      if (index === 1) {
        set({ overlay: "debug_menu" });
        return;
      }

      if (index === 2) {
        set({ overlay: "settings" });
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

    if (activeMenu === "settings") {
      if (index === 0) {
        set({ overlay: null });
        return;
      }

      if (index === 1) {
        // placeholder: controls/settings action
        return;
      }

      if (index === 2) {
        set({
          screen: "main",
          overlay: null,
        });
        return;
      }
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
    if (!playableScreens.has(screen)) return;

    set({ overlay: "pause" });
  },
  closeOverlay: () => {
    set({ overlay: null });
  },
  togglePauseMenu: () => {
    const { screen, overlay } = get();

    if (!playableScreens.has(screen)) return;

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
        dir === 1 ? selection.nextVehicle() : selection.prevVehicle();
        return;
      }

      if (index === 1) {
        dir === 1 ? selection.nextMap() : selection.prevMap();
        return;
      }
    }
  },

  selectedMission: null,
  setSelectedMission: (mission: SignalMission | null) => set({ selectedMission: mission }),

}));