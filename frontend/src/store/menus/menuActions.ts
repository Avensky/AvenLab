import { reconSetupParent, useAlphaStore } from "../alpha/alphaStore";
import type { StateCreator } from "zustand";
import { MAIN_MENU_ITEMS, PAUSE_MENU_ITEMS, PAUSE_MENU_RAILS, PAUSE_RESUME_INDEX } from "../../game/menus/menuItems";
import { cycleCanInterface, cycleCaptureMode } from "../recon/captureSetup";
import { useSelectionStore } from "../selection/selectionStore";
import { useNetworkStore } from "../session/networkStore";

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

function nextPauseIndex(index: number, step: 1 | -1, axis: "horizontal" | "vertical") {
  if (index === PAUSE_RESUME_INDEX) {
    if (axis === "horizontal") return PAUSE_MENU_RAILS[step === -1 ? 0 : 1].indices[0];
    return step === -1 ? PAUSE_MENU_RAILS[0].indices[0] : index;
  }

  const column = PAUSE_MENU_RAILS.findIndex(({ indices }) => indices.includes(index));
  const rail = PAUSE_MENU_RAILS[column];
  if (!rail) return PAUSE_RESUME_INDEX;

  const row = rail.indices.indexOf(index);
  if (axis === "horizontal") return PAUSE_MENU_RAILS[column + step]?.indices[row] ?? index;

  const nextRow = row + step;
  return nextRow === rail.indices.length ? PAUSE_RESUME_INDEX : (rail.indices[nextRow] ?? index);
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
    get().setActiveMenuIndex(activeMenu === "pause"
      ? nextPauseIndex(current, dir, "vertical")
      : (current + dir + count) % count);
  },

  activateActiveMenuSelection: () => {
    const activeMenu = get().getActiveMenuId();
    if (!activeMenu) return;

    const index = get().selectedMenuIndexById[activeMenu] ?? 0;

    if (activeMenu === "main") {
      const item = MAIN_MENU_ITEMS[index];
      if (item?.available) {
        if(item.id==='play')useAlphaStore.getState().chooseMode(useAlphaStore.getState().lastMatchMode);
        else if(item.id==='explore')useAlphaStore.getState().chooseMode('sandbox');
        get().setScreen(item.screen);
      }
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
      else if (index === 4) get().setScreen(reconSetupParent());
      return;
    }

    if (activeMenu === "sandbox_setup") {
      if (index === 0) {
        useSelectionStore.getState().nextVehicle();
        return;
      }

      if (index === 1) {
        if (useNetworkStore.getState().worldMap) return;
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

    if (activeMenu === "pause") {
      get().setActiveMenuIndex(nextPauseIndex(index, dir, "horizontal"));
      return;
    }

    if (activeMenu === "signal_recon_setup") {
      const selection = useSelectionStore.getState();
      if (index === 0) {
        cycleCanInterface(dir);
      } else if (index === 1) {
        cycleCaptureMode(dir);
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
        if (useNetworkStore.getState().worldMap) return;
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
