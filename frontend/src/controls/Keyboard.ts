import { useEffect } from "react";
import { useInputStore } from "../store/inputStore";
import { useUIStore } from "../store/uiStore";
import { useCanDataStore } from "../store/canDataStore";
import { VehicleFlags, PlayerFlags } from "../store/tools/inputMasks";
import { canDrive, isTypingTarget, routeMenuAction, type MenuAction } from "../store/tools/inputRouting";

const ANALOG_KEYS = new Set(["KeyW", "KeyS", "KeyA", "KeyD", "Space", "KeyB"]);
const MENU_KEYS: Record<string, MenuAction> = {
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  Enter: "activate", Space: "activate", Escape: "back",
};
const VEHICLE_TOGGLES: Record<string, number> = {
  KeyE: VehicleFlags.ENGINE_ON, KeyL: VehicleFlags.HEADLIGHTS,
  KeyZ: VehicleFlags.BLINKER_LEFT, KeyX: VehicleFlags.BLINKER_RIGHT,
  KeyH: VehicleFlags.HAZARDS, KeyQ: VehicleFlags.ABS, KeyT: VehicleFlags.TCS,
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
    const updateAxes = () => useInputStore.getState().setAnalogFromSource("keyboard", {
      throttle: Number(keys.has("KeyW")) - Number(keys.has("KeyS")),
      steer: Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
      brake: Number(keys.has("Space")), handbrake: Number(keys.has("KeyB")),
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !focused || document.visibilityState === "hidden" || isTypingTarget(event.target)) return;
      const ui = useUIStore.getState();
      // DebugMenu and focused GameButtons own these events. Never also brake
      // or toggle a vehicle flag when selecting a debugger option.
      if (ui.overlay === "debug_menu") return;
      if (!ui.isModeLoading && ui.overlay === null
        && ["sandbox", "swarm", "signal_recon"].includes(ui.screen) && event.code === "Backquote") {
        event.preventDefault();
        useCanDataStore.getState().setCommandOpen(!useCanDataStore.getState().commandOpen);
        return;
      }
      if (!canDrive()) {
        release();
        if (useCanDataStore.getState().commandOpen) return;
        const action = MENU_KEYS[event.code];
        if (action) { event.preventDefault(); routeMenuAction(action); }
        return;
      }
      const store = useInputStore.getState();
      if (event.code === "Escape") {
        event.preventDefault(); ui.togglePauseMenu(); return;
      }
      keys.add(event.code);
      if (ANALOG_KEYS.has(event.code)) { event.preventDefault(); updateAxes(); }
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
      if (owned && ANALOG_KEYS.has(event.code)) updateAxes();
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
      unsubscribeUI(); unsubscribeCAN(); release();
    };
  }, []);
  return null;
}
