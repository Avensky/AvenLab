import { useGameStore } from "../store/presentation/gameStore";
import { leaveInspection } from "../store/presentation/inspectionActions";
import { usePreferencesStore } from "../store/preferences/preferencesStore";
import { useTextKeyboardStore } from "../store/text/keyboardStore";
import { useEffect } from "react";
import { useInputStore } from "../store/input/inputStore";
import { useUIStore } from "../store/menus/uiStore";
import { useCanDataStore } from "../store/recon/canDataStore";
import { VehicleFlags, PlayerFlags } from "../store/input/protocol/inputMasks";
import {
  canDrive,
  canNavigateMenu,
  isTypingTarget,
  routeMenuAction,
} from "./inputRouting";
import { useRenderSettingsStore } from "../store/presentation/renderSettingsStore";
import { stepManualGear } from "./drivetrainActions";
import { routePhysicalMenuPress } from "./physicalMenuPress";
import { togglePerformanceCapture } from "../performance/captureActions";
import {
  minimizePerformanceOverlay,
  performanceOverlayHasFocus,
  togglePerformanceDetails,
  usePerformanceOverlayStore,
} from "../performance/performanceOverlayStore";

function axis(value = 0, deadzone = 0.12) {
  return Number.isFinite(value) && Math.abs(value) >= deadzone
    ? Math.max(-1, Math.min(1, value))
    : 0;
}
function trigger(value = 0) {
  return Number.isFinite(value) && value > 0.05 ? Math.min(1, value) : 0;
}
function menuNeutral(pad: Gamepad) {
  return (
    pad.axes.slice(0, 4).every((value) => axis(value, 0.5) === 0) &&
    [0, 1, 4, 5, 8, 9, 12, 13, 14, 15].every(
      (index) => !pad.buttons[index]?.pressed,
    )
  );
}

export function GameController() {
  useEffect(() => {
    let frameId = 0;
    let focused = document.hasFocus();
    let previousButtons: boolean[] = [];
    let padKey: string | null = null;
    let armed = false;
    let menuArmed = true;
    let resetTimer: number | null = null;
    let lastVertical = -Infinity;
    let lastHorizontal = -Infinity;
    let panelPressHeld = false;
    const releasePanelPress = (cancelled = true) => {
      if (!panelPressHeld) return;
      panelPressHeld = false;
      routePhysicalMenuPress(false, cancelled);
    };
    const release = () => {
      armed = false;
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      resetTimer = null;
      useInputStore.getState().releaseInputSource("gamepad");
    };
    const onBlur = () => {
      releasePanelPress();
      focused = false;
      menuArmed = false;
      release();
    };
    const onFocus = () => {
      focused = true;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        releasePanelPress();
        menuArmed = false;
        release();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (isTypingTarget(event.target)) {
        releasePanelPress();
        menuArmed = false;
        release();
      }
    };
    const resetMenuInput = () => {
      releasePanelPress();
      const pads = Array.from(navigator.getGamepads?.() ?? []);
      const pad =
        pads.find(
          (item) => item?.connected && `${item.index}:${item.id}` === padKey,
        ) ?? pads.find((item) => item?.connected);
      menuArmed = !pad || menuNeutral(pad);
      lastVertical = lastHorizontal = -Infinity;
    };
    const releaseIfBlocked = (
      state: ReturnType<typeof useUIStore.getState>,
      previous: ReturnType<typeof useUIStore.getState>,
    ) => {
      if (
        state.screen !== previous.screen ||
        state.overlay !== previous.overlay ||
        state.isModeLoading !== previous.isModeLoading
      )
        resetMenuInput();
      if (!canDrive()) release();
    };
    const unsubscribeGame = useGameStore.subscribe(() => release());
    const unsubscribeUI = useUIStore.subscribe(releaseIfBlocked);
    const unsubscribePerformance = usePerformanceOverlayStore.subscribe(
      (state, previous) => {
        if (state.focused !== previous.focused) {
          resetMenuInput();
          release();
        }
      },
    );
    const unsubscribeCAN = useCanDataStore.subscribe((state, previous) => {
      if (state.commandOpen !== previous.commandOpen) resetMenuInput();
      if (state.commandOpen && !previous.commandOpen) release();
    });

    const poll = () => {
      frameId = requestAnimationFrame(poll);
      // A connected controller can occupy any slot. Keep the selected one
      // until it disconnects, then release only its device's intent.
      const pads = Array.from(navigator.getGamepads?.() ?? []);
      const pad =
        pads.find(
          (item) => item?.connected && `${item.index}:${item.id}` === padKey,
        ) ?? pads.find((item) => item?.connected);
      if (!pad) {
        releasePanelPress();
        if (padKey !== null) release();
        padKey = null;
        previousButtons = [];
        return;
      }
      const buttons = pad.buttons.map((button) => button.pressed);
      const nextKey = `${pad.index}:${pad.id}`;
      if (nextKey !== padKey) {
        releasePanelPress();
        release();
        padKey = nextKey;
        previousButtons = buttons;
        menuArmed = menuNeutral(pad);
      }
      const pressed = (index: number) => buttons[index] === true;
      const edges = buttons.map(
        (_, index) => pressed(index) && !previousButtons[index],
      );
      // Record every button every poll, including while menus/focus block driving.
      previousButtons = buttons;
      if (!focused || document.visibilityState === "hidden") {
        releasePanelPress();
        release();
        return;
      }
      if (useCanDataStore.getState().commandOpen) {
        release();
        return;
      }
      if (panelPressHeld && !pressed(0)) releasePanelPress(false);
      const ui = useUIStore.getState();
      // Controller forms route A/D-pad to their focused fields. Their assisted
      // input opens our keyboard; physical typing remains a normal text edit.
      const typing =
        isTypingTarget(document.activeElement) &&
        !(
          document.activeElement instanceof HTMLElement &&
          document.activeElement.closest("[data-controller-form]")
        );
      const recorderText =
        typing &&
        document.activeElement instanceof HTMLElement &&
        Boolean(document.activeElement.closest("[data-performance-overlay]"));
      if (
        useGameStore.getState().editor &&
        ui.overlay === null &&
        edges[1] &&
        !typing
      ) {
        release();
        leaveInspection();
        return;
      }
      if (
        edges[8] &&
        pressed(4) &&
        (canDrive() ||
          (useGameStore.getState().editor &&
            ui.screen === "sandbox" &&
            ui.overlay === null)) &&
        !typing
      ) {
        release();
        ui.openCockpit("console");
        return;
      }
      if (
        edges[8] &&
        ui.screen === "sandbox" &&
        ui.overlay === null &&
        !ui.isModeLoading &&
        (!typing || performanceOverlayHasFocus() || recorderText)
      ) {
        release();
        togglePerformanceDetails();
        return;
      }
      if (typing) {
        release();
        if ((performanceOverlayHasFocus() || recorderText) && edges[1])
          minimizePerformanceOverlay();
        return;
      }
      if (edges[9]) {
        release();
        if (useTextKeyboardStore.getState().session) {
          useTextKeyboardStore.getState().close();
          return;
        }
        useUIStore.getState().togglePauseMenu();
        return;
      }
      if (!canDrive()) {
        release();
        if (!canNavigateMenu()) {
          releasePanelPress();
          return;
        }
        // A held steering/look stick or the button that opened this panel must
        // return to neutral before it can navigate or alter the new panel.
        if (!menuArmed) {
          if (menuNeutral(pad)) menuArmed = true;
          return;
        }
        if (panelPressHeld) {
          if (edges[1]) {
            releasePanelPress();
            routeMenuAction("back");
          }
          return;
        }
        const now = performance.now();
        const vertical =
          Math.abs(axis(pad.axes[1], 0.5)) >= Math.abs(axis(pad.axes[3], 0.5))
            ? axis(pad.axes[1], 0.5)
            : axis(pad.axes[3], 0.5);
        const horizontal =
          Math.abs(axis(pad.axes[0], 0.5)) >= Math.abs(axis(pad.axes[2], 0.5))
            ? axis(pad.axes[0], 0.5)
            : axis(pad.axes[2], 0.5);
        // At most one action per poll: navigation must commit before a later
        // activation can target its row or a panel opened by that action.
        if (edges[12] || edges[13]) {
          routeMenuAction(edges[12] ? "up" : "down");
          lastVertical = now;
          return;
        } else if (vertical !== 0 && now - lastVertical >= 220) {
          routeMenuAction(vertical < 0 ? "up" : "down");
          lastVertical = now;
          return;
        }
        if (edges[14] || edges[15]) {
          routeMenuAction(edges[14] ? "left" : "right");
          lastHorizontal = now;
          return;
        } else if (horizontal !== 0 && now - lastHorizontal >= 220) {
          routeMenuAction(horizontal < 0 ? "left" : "right");
          lastHorizontal = now;
          return;
        }
        if (edges[4] || edges[5]) {
          routeMenuAction(edges[4] ? "previous_tab" : "next_tab");
          return;
        }
        if (edges[0]) {
          if (ui.overlay === "cockpit" && routePhysicalMenuPress(true))
            panelPressHeld = true;
          else routeMenuAction("activate");
        } else if (edges[1]) routeMenuAction("back");
        return;
      }
      const preferences = usePreferencesStore.getState();
      const steer = Math.max(
        -1,
        Math.min(
          1,
          axis(pad.axes[0], preferences.controllerDeadzone) *
            preferences.steeringSensitivity *
            (preferences.invertSteering ? -1 : 1),
        ),
      );
      const throttle =
        trigger(pad.buttons[7]?.value) ||
        -axis(pad.axes[3], preferences.controllerDeadzone);
      const brake = trigger(pad.buttons[6]?.value);
      const handbrake = Number(pressed(1));
      // After menu/focus/device changes, release and re-engage drive controls.
      // B used to leave a menu must not immediately become a held handbrake.
      if (!armed) {
        if (
          steer !== 0 ||
          throttle !== 0 ||
          brake !== 0 ||
          handbrake !== 0 ||
          pressed(4) ||
          pressed(5) ||
          pressed(10)
        )
          return;
        armed = true;
      }
      const store = useInputStore.getState();
      // Visible recording keeps priority over manual upshift on A/Cross.
      if (
        edges[0] &&
        useUIStore.getState().screen === "sandbox" &&
        useRenderSettingsStore.getState().overlay
      )
        togglePerformanceCapture();
      else if (edges[0]) stepManualGear(1);
      store.setAnalogFromSource("gamepad", {
        throttle,
        steer,
        brake,
        handbrake,
      });
      store.setHeldVehicleFlag("gamepad", VehicleFlags.BOOST, pressed(4));
      store.setHeldPlayerFlag("gamepad", PlayerFlags.HONK, pressed(5));
      if (edges[2]) store.toggleVehicleFlag(VehicleFlags.ENGINE_ON);
      if (edges[3]) store.toggleVehicleFlag(VehicleFlags.HEADLIGHTS);
      if (edges[12]) store.toggleVehicleFlag(VehicleFlags.HAZARDS);
      if (edges[14]) store.toggleVehicleFlag(VehicleFlags.BLINKER_LEFT);
      if (edges[15]) store.toggleVehicleFlag(VehicleFlags.BLINKER_RIGHT);
      if (edges[11] && !stepManualGear(-1))
        store.togglePlayerFlag(PlayerFlags.DYNO);
      if (edges[13]) store.togglePlayerFlag(PlayerFlags.RADIO);
      if (edges[10]) {
        if (resetTimer !== null) window.clearTimeout(resetTimer);
        store.setHeldPlayerFlag("gamepad", PlayerFlags.RESET, true);
        resetTimer = window.setTimeout(() => {
          resetTimer = null;
          useInputStore
            .getState()
            .setHeldPlayerFlag("gamepad", PlayerFlags.RESET, false);
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
      unsubscribeGame();
      unsubscribeUI();
      unsubscribeCAN();
      unsubscribePerformance();
      releasePanelPress();
      release();
    };
  }, []);
  return null;
}
