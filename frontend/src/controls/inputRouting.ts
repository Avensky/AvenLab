import { useGameStore } from "../store/presentation/gameStore";
import { isDrivingScreen, useUIStore } from "../store/menus/uiStore";
import { useCanDataStore } from "../store/recon/canDataStore";
import { performanceOverlayHasFocus } from "../performance/performanceOverlayStore";
import { useTextKeyboardStore } from "../store/text/keyboardStore";

export type MenuAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "activate"
  | "back"
  | "previous_tab"
  | "next_tab";

export function canDrive() {
  const ui = useUIStore.getState();
  return (
    !useTextKeyboardStore.getState().session &&
    !useGameStore.getState().editor &&
    isDrivingScreen(ui.screen) &&
    ui.overlay === null &&
    !ui.isModeLoading &&
    !useCanDataStore.getState().commandOpen &&
    !performanceOverlayHasFocus()
  );
}

export function canNavigateMenu() {
  if (useTextKeyboardStore.getState().session) return true;
  if (performanceOverlayHasFocus()) return true;
  const ui = useUIStore.getState();
  const panel = ui.overlay ?? ui.screen;
  return (
    !ui.isModeLoading &&
    (ui.getActiveMenuId() !== null ||
      [
        "debug_menu",
        "settings",
        "career",
        "missions",
        "vehicle_select",
        "leave_game",
        "cockpit",
        "world_builder",
        "social",
      ].includes(panel))
  );
}

export function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}

export function routeMenuAction(action: MenuAction) {
  if (useTextKeyboardStore.getState().session) {
    window.dispatchEvent(
      new CustomEvent<MenuAction>("avenlab:keyboard-action", {
        detail: action,
      }),
    );
    return;
  }
  if (performanceOverlayHasFocus()) {
    window.dispatchEvent(
      new CustomEvent<MenuAction>("avenlab:performance-action", {
        detail: action,
      }),
    );
    return;
  }
  const ui = useUIStore.getState();
  if (!canNavigateMenu()) return;
  const panel = ui.overlay ?? ui.screen;
  if (
    [
      "debug_menu",
      "settings",
      "career",
      "missions",
      "vehicle_select",
      "leave_game",
      "cockpit",
      "world_builder",
      "social",
    ].includes(panel)
  ) {
    window.dispatchEvent(
      new CustomEvent<MenuAction>("avenlab:panel-action", { detail: action }),
    );
    return;
  }
  if (action === "previous_tab" || action === "next_tab") return;
  if (action === "up" || action === "down")
    ui.moveActiveMenuSelection(action === "up" ? -1 : 1);
  else if (action === "left" || action === "right")
    ui.moveActiveMenuHorizontal(action === "left" ? -1 : 1);
  else if (action === "activate") ui.activateActiveMenuSelection();
  else if (ui.overlay !== null) ui.closeOverlay();
  else if (ui.screen === "sandbox_setup")
    window.dispatchEvent(new Event("avenlab:sandbox-exit"));
  else if (ui.screen === "settings" || ui.screen === "signal_recon_setup")
    ui.setScreen("main");
}
