import { useUIStore } from "../uiStore";
import { useCanDataStore } from "../canDataStore";

export type MenuAction = "up" | "down" | "left" | "right" | "activate" | "back";

export function canDrive() {
  const ui = useUIStore.getState();
  return ["sandbox", "swarm", "signal_recon"].includes(ui.screen)
    && ui.overlay === null && !ui.isModeLoading
    && !useCanDataStore.getState().commandOpen;
}

export function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && (target.tagName === "INPUT" || target.tagName === "TEXTAREA"
      || target.tagName === "SELECT" || target.isContentEditable);
}

export function routeMenuAction(action: MenuAction) {
  const ui = useUIStore.getState();
  if (ui.isModeLoading) return;
  if (ui.overlay === "debug_menu") {
    // DebugMenu owns its rows. Gamepad events use the same handler as keys.
    window.dispatchEvent(new Event(`avenlab:debug-menu-${action}`));
    return;
  }
  if (ui.screen === "sandbox_setup" && ui.overlay === null) {
    // Preserve the setup screen's existing two selection rows and start/exit events.
    if (action === "up" || action === "down") ui.setActiveMenuIndex((ui.getActiveMenuIndex() + 1) % 2);
    else if (action === "left" || action === "right") ui.moveActiveMenuHorizontal(action === "left" ? -1 : 1);
    else window.dispatchEvent(new Event(action === "activate" ? "avenlab:sandbox-start" : "avenlab:sandbox-exit"));
    return;
  }
  if (action === "up" || action === "down") ui.moveActiveMenuSelection(action === "up" ? -1 : 1);
  else if (action === "left" || action === "right") ui.moveActiveMenuHorizontal(action === "left" ? -1 : 1);
  else if (action === "activate") ui.activateActiveMenuSelection();
  else if (ui.overlay !== null) ui.closeOverlay();
  else if (ui.screen === "settings") ui.setScreen("main");
}
