import { isDrivingScreen, useUIStore } from "../uiStore";
import { useCanDataStore } from "../canDataStore";

export type MenuAction = "up" | "down" | "left" | "right" | "activate" | "back" | "previous_tab" | "next_tab";

export function canDrive() {
  const ui = useUIStore.getState();
  return isDrivingScreen(ui.screen)
    && ui.overlay === null && !ui.isModeLoading
    && !useCanDataStore.getState().commandOpen;
}

export function canNavigateMenu() {
  const ui = useUIStore.getState();
  const panel = ui.overlay ?? ui.screen;
  return !ui.isModeLoading && (ui.getActiveMenuId() !== null
    || ["debug_menu", "settings", "career", "missions", "vehicle_select", "leave_game"].includes(panel));
}

export function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && (target.tagName === "INPUT" || target.tagName === "TEXTAREA"
      || target.tagName === "SELECT" || target.isContentEditable);
}

export function routeMenuAction(action: MenuAction) {
  const ui = useUIStore.getState();
  if (!canNavigateMenu()) return;
  const panel = ui.overlay ?? ui.screen;
  if (["debug_menu", "settings", "career", "missions", "vehicle_select", "leave_game"].includes(panel)) {
    window.dispatchEvent(new CustomEvent<MenuAction>("avenlab:panel-action", { detail: action }));
    return;
  }
  if (action === "previous_tab" || action === "next_tab") return;
  if (action === "up" || action === "down") ui.moveActiveMenuSelection(action === "up" ? -1 : 1);
  else if (action === "left" || action === "right") ui.moveActiveMenuHorizontal(action === "left" ? -1 : 1);
  else if (action === "activate") ui.activateActiveMenuSelection();
  else if (ui.overlay !== null) ui.closeOverlay();
  else if (ui.screen === "sandbox_setup") window.dispatchEvent(new Event("avenlab:sandbox-exit"));
  else if (ui.screen === "settings" || ui.screen === "signal_recon_setup") ui.setScreen("main");
}
