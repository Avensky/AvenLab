import type { StateCreator } from "zustand";
import { MAIN_MENU_ITEMS, PAUSE_MENU_ITEMS } from "../../game/menus/menuItems";
import {
  CAN_INTERFACE_OPTIONS,
  CAN_MODE_OPTIONS,
  useCanBusStore,
} from "../recon/canBusStore";
import { useSelectionStore } from "../selection/selectionStore";

import {
  isDrivingScreen,
  type MenuId,
  type MenuScreen,
  type UIOverlay,
  type UIState,
} from "./types";
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

export const createMenuActions: StateCreator<
  UIState,
  [],
  [],
  Pick<
    UIState,
    | "getActiveMenuId"
    | "getActiveMenuIndex"
    | "setActiveMenuIndex"
    | "moveActiveMenuSelection"
    | "activateActiveMenuSelection"
    | "moveActiveMenuHorizontal"
  >
> = (set, get) => ({
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
      else if (index === 3)
        window.dispatchEvent(new Event("avenlab:signal-recon-start"));
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
  moveActiveMenuHorizontal: (dir) => {
    const activeMenu = get().getActiveMenuId();
    if (!activeMenu) return;

    const index = get().selectedMenuIndexById[activeMenu] ?? 0;

    if (activeMenu === "signal_recon_setup") {
      const selection = useSelectionStore.getState();
      const bus = useCanBusStore.getState();
      if (index === 0) {
        const current = CAN_INTERFACE_OPTIONS.indexOf(bus.selectedInterface);
        bus.setSelectedInterface(
          CAN_INTERFACE_OPTIONS[
            (current + dir + CAN_INTERFACE_OPTIONS.length) %
              CAN_INTERFACE_OPTIONS.length
          ],
        );
      } else if (index === 1) {
        const current = CAN_MODE_OPTIONS.indexOf(bus.selectedMode);
        bus.setSelectedMode(
          CAN_MODE_OPTIONS[
            (current + dir + CAN_MODE_OPTIONS.length) % CAN_MODE_OPTIONS.length
          ],
        );
      } else if (index === 2) {
        if (dir === 1) selection.nextVehicle();
        else selection.prevVehicle();
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
});
