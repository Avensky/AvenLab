import { usePreferencesStore } from "../store/preferencesStore";
import { useEffect } from "react";
import { useInputStore } from "../store/inputStore";
import { useUIStore } from "../store/uiStore";
import { useCanDataStore } from "../store/canDataStore";
import { VehicleFlags, PlayerFlags } from "../store/tools/inputMasks";
import { canDrive, canNavigateMenu, isTypingTarget, routeMenuAction } from "../store/tools/inputRouting";

function axis(value = 0, deadzone = 0.12) {
  return Number.isFinite(value) && Math.abs(value) >= deadzone ? Math.max(-1, Math.min(1, value)) : 0;
}
function trigger(value = 0) {
  return Number.isFinite(value) && value > 0.05 ? Math.min(1, value) : 0;
}

export function GameController() {
  useEffect(() => {
    let frameId = 0;
    let focused = document.hasFocus();
    let previousButtons: boolean[] = [];
    let padKey: string | null = null;
    let armed = false;
    let resetTimer: number | null = null;
    let lastVertical = -Infinity;
    let lastHorizontal = -Infinity;
    const release = () => {
      armed = false;
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      resetTimer = null;
      useInputStore.getState().releaseInputSource("gamepad");
    };
    const onBlur = () => { focused = false; release(); };
    const onFocus = () => { focused = true; };
    const onVisibility = () => { if (document.visibilityState === "hidden") release(); };
    const onFocusIn = (event: FocusEvent) => { if (isTypingTarget(event.target)) release(); };
    const releaseIfBlocked = () => { if (!canDrive()) release(); };
    const unsubscribeUI = useUIStore.subscribe(releaseIfBlocked);
    const unsubscribeCAN = useCanDataStore.subscribe((state, previous) => {
      if (state.commandOpen && !previous.commandOpen) release();
    });

    const poll = () => {
      frameId = requestAnimationFrame(poll);
      // A connected controller can occupy any slot. Keep the selected one
      // until it disconnects, then release only its device's intent.
      const pads = Array.from(navigator.getGamepads?.() ?? []);
      const pad = pads.find((item) => item?.connected && `${item.index}:${item.id}` === padKey)
        ?? pads.find((item) => item?.connected);
      if (!pad) { if (padKey !== null) release(); padKey = null; previousButtons = []; return; }
      const buttons = pad.buttons.map((button) => button.pressed);
      const nextKey = `${pad.index}:${pad.id}`;
      if (nextKey !== padKey) { release(); padKey = nextKey; previousButtons = buttons; }
      const pressed = (index: number) => buttons[index] === true;
      const edges = buttons.map((_, index) => pressed(index) && !previousButtons[index]);
      // Record every button every poll, including while menus/focus block driving.
      previousButtons = buttons;
      if (!focused || document.visibilityState === "hidden" || isTypingTarget(document.activeElement)) { release(); return; }
      if (useCanDataStore.getState().commandOpen) { release(); return; }
      if (edges[9]) { release(); useUIStore.getState().togglePauseMenu(); return; }
      if (!canDrive()) {
        release();
        if (!canNavigateMenu()) return;
        const now = performance.now();
        const vertical = Math.abs(axis(pad.axes[1], 0.5)) >= Math.abs(axis(pad.axes[3], 0.5))
          ? axis(pad.axes[1], 0.5) : axis(pad.axes[3], 0.5);
        const horizontal = Math.abs(axis(pad.axes[0], 0.5)) >= Math.abs(axis(pad.axes[2], 0.5))
          ? axis(pad.axes[0], 0.5) : axis(pad.axes[2], 0.5);
        if (edges[12] || edges[13]) { routeMenuAction(edges[12] ? "up" : "down"); lastVertical = now; }
        else if (vertical !== 0 && now - lastVertical >= 220) { routeMenuAction(vertical < 0 ? "up" : "down"); lastVertical = now; }
        if (edges[14] || edges[15]) { routeMenuAction(edges[14] ? "left" : "right"); lastHorizontal = now; }
        else if (horizontal !== 0 && now - lastHorizontal >= 220) { routeMenuAction(horizontal < 0 ? "left" : "right"); lastHorizontal = now; }
        if (edges[4] || edges[5]) routeMenuAction(edges[4] ? "previous_tab" : "next_tab");
        if (edges[0]) routeMenuAction("activate");
        else if (edges[1]) routeMenuAction("back");
        return;
      }
      const preferences = usePreferencesStore.getState();
      const steer = Math.max(-1, Math.min(1, axis(pad.axes[0], preferences.controllerDeadzone) * preferences.steeringSensitivity * (preferences.invertSteering ? -1 : 1)));
      const throttle = trigger(pad.buttons[7]?.value) || -axis(pad.axes[3], preferences.controllerDeadzone);
      const brake = trigger(pad.buttons[6]?.value);
      const handbrake = Number(pressed(1));
      // After menu/focus/device changes, release and re-engage drive controls.
      // B used to leave a menu must not immediately become a held handbrake.
      if (!armed) {
        if (steer !== 0 || throttle !== 0 || brake !== 0 || handbrake !== 0 || pressed(4) || pressed(5) || pressed(10)) return;
        armed = true;
      }
      const store = useInputStore.getState();
      store.setAnalogFromSource("gamepad", { throttle, steer, brake, handbrake });
      store.setHeldVehicleFlag("gamepad", VehicleFlags.BOOST, pressed(4));
      store.setHeldPlayerFlag("gamepad", PlayerFlags.HONK, pressed(5));
      if (edges[2]) store.toggleVehicleFlag(VehicleFlags.ENGINE_ON);
      if (edges[3]) store.toggleVehicleFlag(VehicleFlags.HEADLIGHTS);
      if (edges[12]) store.toggleVehicleFlag(VehicleFlags.HAZARDS);
      if (edges[14]) store.toggleVehicleFlag(VehicleFlags.BLINKER_LEFT);
      if (edges[15]) store.toggleVehicleFlag(VehicleFlags.BLINKER_RIGHT);
      if (edges[8]) store.togglePlayerFlag(PlayerFlags.CANDUMP);
      if (edges[11]) store.togglePlayerFlag(PlayerFlags.DYNO);
      if (edges[13]) store.togglePlayerFlag(PlayerFlags.RADIO);
      if (edges[10]) {
        if (resetTimer !== null) window.clearTimeout(resetTimer);
        store.setHeldPlayerFlag("gamepad", PlayerFlags.RESET, true);
        resetTimer = window.setTimeout(() => {
          resetTimer = null;
          useInputStore.getState().setHeldPlayerFlag("gamepad", PlayerFlags.RESET, false);
        }, 100);
      }
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("focusin", onFocusIn);
    frameId = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("focusin", onFocusIn);
      unsubscribeUI(); unsubscribeCAN(); release();
    };
  }, []);
  return null;
}
