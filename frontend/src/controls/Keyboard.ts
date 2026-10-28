import { useEffect } from "react";
import { usePreferencesStore } from "../store/preferencesStore";
import { useInputStore } from "../store/inputStore";
import { isDrivingScreen, useUIStore } from "../store/uiStore";
import { useCanDataStore } from "../store/canDataStore";
import { useRenderSettingsStore } from "../store/renderSettingsStore";
import { VehicleFlags, PlayerFlags, hasFlag } from "../store/tools/inputMasks";
import { useNetworkStore } from "../store/networkStore";
import { useVehicleConfigStore } from "../store/vehicleConfigStore";
import { unpackCockpit } from "../store/tools/cockpitMasks";
import { canDrive, canNavigateMenu, isTypingTarget, routeMenuAction, type MenuAction } from "../store/tools/inputRouting";
import { togglePerformanceCapture } from "../performance/captureActions";
import { closePerformanceOverlay, togglePerformanceDetails, usePerformanceOverlayStore } from "../performance/performanceOverlayStore";

const MENU_KEYS: Record<string, MenuAction> = {
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  Enter: "activate", Space: "activate", Escape: "back", KeyQ: "previous_tab", KeyE: "next_tab", PageUp: "previous_tab", PageDown: "next_tab",
};
const VEHICLE_TOGGLES: Record<string, number> = {
  KeyE: VehicleFlags.ENGINE_ON, KeyL: VehicleFlags.HEADLIGHTS,
  KeyZ: VehicleFlags.BLINKER_LEFT, KeyX: VehicleFlags.BLINKER_RIGHT,
  KeyQ: VehicleFlags.ABS, KeyT: VehicleFlags.TCS,
};
const PLAYER_TOGGLES: Record<string, number> = {
  KeyC: PlayerFlags.CANDUMP, KeyV: PlayerFlags.LIVECAN,
  KeyY: PlayerFlags.DYNO, KeyM: PlayerFlags.RADIO,
};

export function Keyboard() {
  useEffect(() => {
    const keys = new Set<string>();
    let focused = document.hasFocus();
    let resetTimer: number | null = null;
    const release = () => {
      keys.clear();
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      resetTimer = null;
      useInputStore.getState().releaseInputSource("keyboard");
    };
    const updateAxes = () => {
      const bindings = usePreferencesStore.getState().bindings;
      useInputStore.getState().setAnalogFromSource("keyboard", {
        throttle: Number(keys.has(bindings.forward)) - Number(keys.has(bindings.reverse)),
        steer: Number(keys.has(bindings.right)) - Number(keys.has(bindings.left)),
        brake: Number(keys.has(bindings.brake)), handbrake: Number(keys.has(bindings.handbrake)),
      });
    };
    const isAnalogKey = (code: string) => Object.values(usePreferencesStore.getState().bindings).includes(code);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !focused || document.visibilityState === "hidden" || isTypingTarget(event.target)) return;
      const ui = useUIStore.getState();
      if (event.code === "F4" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
        && isDrivingScreen(ui.screen) && !ui.isModeLoading && !useCanDataStore.getState().commandOpen) {
        event.preventDefault(); release();
        if (ui.overlay === "cockpit") ui.closeOverlay();
        else if (ui.overlay === null || ui.overlay === "pause") ui.openCockpit();
        return;
      }
      if (event.code === "F3" && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
        && ui.screen === "sandbox" && ui.overlay === null && !ui.isModeLoading && !useCanDataStore.getState().commandOpen) {
        event.preventDefault(); release(); togglePerformanceDetails(); return;
      }
      if ((event.code === "F2" || event.code === "F3") && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
        && isDrivingScreen(ui.screen) && !ui.isModeLoading && !useCanDataStore.getState().commandOpen) {
        event.preventDefault();
        if (event.code === "F2") ui.toggleDebugMenu();
        else {
          const settings = useRenderSettingsStore.getState();
          if (settings.overlay) closePerformanceOverlay();
          else settings.update({ overlay: true });
        }
        return;
      }
      if (event.code === "KeyH" && isDrivingScreen(ui.screen) && !ui.isModeLoading
        && !useCanDataStore.getState().commandOpen) {
        if (event.shiftKey && canDrive()) {
          event.preventDefault();
          useInputStore.getState().toggleVehicleFlag(VehicleFlags.HAZARDS);
          return;
        }
        if (!event.shiftKey && (ui.overlay === null || ui.overlay === "pause")) {
          event.preventDefault(); release(); ui.openVehicleSelection(); return;
        }
      }
      // Focused menu buttons consume activation before this listener. Menu
      // actions always stay separate from driving controls.
      if (!ui.isModeLoading && ui.overlay === null
        && isDrivingScreen(ui.screen) && event.code === "Backquote") {
        event.preventDefault();
        useCanDataStore.getState().setCommandOpen(!useCanDataStore.getState().commandOpen);
        return;
      }
      if (ui.screen === "sandbox" && ui.overlay === null && !ui.isModeLoading && !useCanDataStore.getState().commandOpen
        && event.code === "F8" && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault(); togglePerformanceCapture(); return;
      }
      if (!canDrive()) {
        release();
        if (useCanDataStore.getState().commandOpen || !canNavigateMenu()) return;
        const action = MENU_KEYS[event.code];
        if (action) { event.preventDefault(); routeMenuAction(action); }
        return;
      }
      const store = useInputStore.getState();
      if (event.code === "Escape") {
        event.preventDefault(); ui.togglePauseMenu(); return;
      }
      keys.add(event.code);
      if (isAnalogKey(event.code)) { event.preventDefault(); updateAxes(); }
      else if (event.code === "KeyT") {
        // Shortcuts use the raw confirmed packet even when every HUD is hidden.
        const network = useNetworkStore.getState(), confirmed = network.getMe();
        const version = useVehicleConfigStore.getState().byPlayer[network.playerId]?.cockpitVersion ?? 0;
        const age = performance.now() - (network.snapshot?.received_at_ms ?? -Infinity);
        if (network.connected && confirmed && age >= 0 && age < 500 && version >= 2) {
          const enabled = hasFlag(confirmed.vehicle_mask, VehicleFlags.TCS);
          store.setAssist(unpackCockpit(confirmed.cockpit_mask).assist === 1 ? 1 : enabled ? 2 : 0, !enabled);
        } else store.toggleVehicleFlag(VehicleFlags.TCS);
      }
      else if (VEHICLE_TOGGLES[event.code] !== undefined) store.toggleVehicleFlag(VEHICLE_TOGGLES[event.code]);
      else if (PLAYER_TOGGLES[event.code] !== undefined) store.togglePlayerFlag(PLAYER_TOGGLES[event.code]);
      else if (event.code === "ShiftLeft") store.setHeldVehicleFlag("keyboard", VehicleFlags.BOOST, true);
      else if (event.code === "KeyN") store.setHeldPlayerFlag("keyboard", PlayerFlags.HONK, true);
      else if (event.code === "KeyR") {
        if (resetTimer !== null) window.clearTimeout(resetTimer);
        store.setHeldPlayerFlag("keyboard", PlayerFlags.RESET, true);
        resetTimer = window.setTimeout(() => {
          resetTimer = null;
          useInputStore.getState().setHeldPlayerFlag("keyboard", PlayerFlags.RESET, false);
        }, 100);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      // Release a key even if focus moved into an input after its keydown.
      const owned = keys.delete(event.code);
      if (owned && isAnalogKey(event.code)) updateAxes();
      if (event.code === "ShiftLeft") useInputStore.getState().setHeldVehicleFlag("keyboard", VehicleFlags.BOOST, false);
      if (event.code === "KeyN") useInputStore.getState().setHeldPlayerFlag("keyboard", PlayerFlags.HONK, false);
    };
    const onBlur = () => { focused = false; release(); };
    const onFocus = () => { focused = true; };
    const onVisibility = () => { if (document.visibilityState === "hidden") release(); };
    const onFocusIn = (event: FocusEvent) => { if (isTypingTarget(event.target)) release(); };
    const releaseIfBlocked = () => { if (!canDrive()) release(); };
    // Clear physical key state at the transition, not on the next key press.
    const unsubscribeUI = useUIStore.subscribe(releaseIfBlocked);
    const unsubscribePerformance = usePerformanceOverlayStore.subscribe((state, previous) => {
      if (state.focused !== previous.focused) release();
    });
    const unsubscribeCAN = useCanDataStore.subscribe((state, previous) => {
      if (state.commandOpen && !previous.commandOpen) release();
    });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("focusin", onFocusIn);
      unsubscribeUI(); unsubscribeCAN(); unsubscribePerformance(); release();
    };
  }, []);
  return null;
}
