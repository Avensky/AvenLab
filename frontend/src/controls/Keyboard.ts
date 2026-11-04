import {useSocialStore} from '../store/social/socialStore';
import {isMatchMode} from '../store/alpha/alphaStore';
import {requestNearestRevive,isMechanicPlayer} from '../combat/reviveTargets';
import {isGuardDpsPlayer,requestGuardBoost,isTankBarrierPlayer,requestTankBarrier,requestDiveShield,isDiveShieldPlayer} from '../combat/guardBoost';
import {setScoreboardHeld,useScoreboardStore} from "../store/hud/scoreboardStore";
import {openHeroGuide,closeHeroGuide} from "../store/hud/heroGuideStore";
import {cycleHealthBarMode,HEALTH_BAR_LABELS} from "../store/preferences/healthVisibility";
import {useChatStore} from "../store/chat/chatStore";
import {useTextKeyboardStore} from "../store/text/keyboardStore";
import {DRIVING_ACTIONS} from '../store/preferences/keyBindings';
import {combatIntent} from '../combat/combatStore';
import {cycleTankWeapon,toggleTankScope,setWeaponHeld,releaseWeaponSource} from '../combat/turretControls';
import {
  openWorldBuilder,
  closeWorldBuilder,
} from "../worldBuilder/state/builderActions";
import {
  leaveInspection,
  enterInspection,
} from "../store/presentation/inspectionActions";
import { useGameStore } from "../store/presentation/gameStore";
import { useEffect } from "react";
import { usePreferencesStore } from "../store/preferences/preferencesStore";
import { useInputStore } from "../store/input/inputStore";
import { isDrivingScreen, useUIStore } from "../store/menus/uiStore";
import { useCanDataStore } from "../store/recon/canDataStore";
import { useRenderSettingsStore } from "../store/presentation/renderSettingsStore";
import {
  VehicleFlags,
  PlayerFlags,
  hasFlag,
} from "../store/input/protocol/inputMasks";
import { useNetworkStore } from "../store/session/networkStore";
import { useVehicleConfigStore } from "../store/session/vehicleConfigStore";
import { cockpitStatus, unpackCockpit } from "../store/input/protocol/cockpitMasks";
import { stepManualGear } from "./drivetrainActions";
import {
  canDrive,
  canNavigateMenu,
  isTypingTarget,
  routeMenuAction,
  type MenuAction,
} from "./inputRouting";
import { togglePerformanceCapture } from "../performance/captureActions";
import {
  performanceOverlayHasFocus,
  closePerformanceOverlay,
  togglePerformanceDetails,
  usePerformanceOverlayStore,
} from "../performance/performanceOverlayStore";

const MENU_KEYS: Record<string, MenuAction> = {
  ArrowUp: "up",
  Numpad8: "up",
  KeyW: "up",
  ArrowDown: "down",
  Numpad2: "down",
  KeyS: "down",
  ArrowLeft: "left",
  Numpad4: "left",
  KeyA: "left",
  ArrowRight: "right",
  Numpad6: "right",
  KeyD: "right",
  Enter: "activate",
  Space: "activate",
  Escape: "back",
  KeyQ: "previous_tab",
  KeyE: "next_tab",
  PageUp: "previous_tab",
  PageDown: "next_tab",
  Digit1: "previous_option",
  Digit3: "next_option",
  Numpad1: "previous_option",
  Numpad3: "next_option",
};
const VEHICLE_TOGGLES: Record<string, number> = {
  KeyE: VehicleFlags.ENGINE_ON,
  KeyZ: VehicleFlags.BLINKER_LEFT,
  KeyX: VehicleFlags.BLINKER_RIGHT,
  KeyQ: VehicleFlags.ABS,
  KeyT: VehicleFlags.TCS,
};
const PLAYER_TOGGLES: Record<string, number> = {
  KeyC: PlayerFlags.CANDUMP,
  KeyV: PlayerFlags.LIVECAN,
  KeyY: PlayerFlags.DYNO,
  KeyM: PlayerFlags.RADIO,
};

export function Keyboard() {
  useEffect(() => {
    const keys = new Set<string>();
    let focused = document.hasFocus();
    let fireKey:string|null=null;
    let secondaryFireKey:string|null=null;
    let resetTimer: number | null = null;
    let tractionHold: number | null = null;
    const release = () => {
      useScoreboardStore.getState().close();
      releaseWeaponSource("keyboard");
      combatIntent.keyboardRam=false;combatIntent.keyboardFire=false;fireKey=null;secondaryFireKey=null;
      keys.clear();
      if (tractionHold !== null) window.clearTimeout(tractionHold);
      tractionHold = null;
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      resetTimer = null;
      useInputStore.getState().releaseInputSource("keyboard");
    };
    const updateAxes = () => {
      const bindings = usePreferencesStore.getState().bindings;
      useInputStore.getState().setAnalogFromSource("keyboard", {
        throttle:
          Number(keys.has(bindings.forward)) -
          Number(keys.has(bindings.reverse)),
        steer:
          Number(keys.has(bindings.right)) - Number(keys.has(bindings.left)),
        brake: Number(keys.has(bindings.brake)),
        handbrake: Number(keys.has(bindings.handbrake)),
      });
    };
    const isAnalogKey=(code:string)=>DRIVING_ACTIONS.some(a=>usePreferencesStore.getState().bindings[a]===code);
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        !focused ||
        document.visibilityState === "hidden" ||
        isTypingTarget(event.target)
      )
        return;
      const ui = useUIStore.getState();
      if(event.code==='KeyL' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey &&
        ui.screen==='sandbox' && !ui.isModeLoading && !useCanDataStore.getState().commandOpen &&
        !useTextKeyboardStore.getState().session && (ui.overlay==='missions'||(ui.overlay===null&&canDrive()))){
        event.preventDefault();release();
        if(ui.overlay==='missions')ui.backToParentMenu();else ui.setOverlay('missions');
        return;
      }
      if(event.code==='F1' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey &&
         !ui.isModeLoading && !useCanDataStore.getState().commandOpen && !useTextKeyboardStore.getState().session &&
         (ui.overlay==='hero_abilities' || (ui.overlay===null &&
           ['sandbox','heroes','hero_select','mode_select'].includes(ui.screen) && !useGameStore.getState().editor))){
        event.preventDefault();release();
        if(ui.overlay==='hero_abilities')closeHeroGuide();else openHeroGuide();
        return;
      }
      if (event.code === "F9" && ui.screen === "world_builder") {
        event.preventDefault();
        release();
        closeWorldBuilder();
        return;
      }
      if (
        event.code === "F9" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey &&
        ui.screen === "sandbox" &&
        !ui.isModeLoading &&
        !useCanDataStore.getState().commandOpen
      ) {
        event.preventDefault();
        release();
        if (ui.overlay === "world_builder") closeWorldBuilder();
        else if (
          ui.overlay === null ||
          ui.overlay === "pause" ||
          ui.overlay === "debug_menu"
        )
          void openWorldBuilder();
        return;
      }
      if (
        ui.screen === "sandbox" &&
        ui.overlay === null &&
        !ui.isModeLoading &&
        ["F6", "F7"].includes(event.code)
      ) {
        event.preventDefault();
        release();
        if (event.code === "F7") {
          if (useGameStore.getState().editor) leaveInspection();
          else enterInspection();
        } else {
          leaveInspection();
          useGameStore.getState().cycleCamera();
        }
        return;
      }
      if (
        event.code === "Escape" &&
        useGameStore.getState().editor &&
        ui.overlay === null
      ) {
        event.preventDefault();
        release();
        leaveInspection();
        return;
      }
      if (
        event.code === "F4" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey &&
        isDrivingScreen(ui.screen) &&
        !ui.isModeLoading &&
        !useCanDataStore.getState().commandOpen
      ) {
        event.preventDefault();
        release();
        if (ui.overlay === "cockpit") ui.closeOverlay();
        else if (ui.overlay === null || ui.overlay === "pause")
          ui.openCockpit();
        return;
      }
      if (
        event.code === "F3" &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        ui.screen === "sandbox" &&
        ui.overlay === null &&
        !ui.isModeLoading &&
        !useCanDataStore.getState().commandOpen
      ) {
        event.preventDefault();
        release();
        togglePerformanceDetails();
        return;
      }
      if (
        (event.code === "F2" || event.code === "F3") &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey &&
        isDrivingScreen(ui.screen) &&
        !ui.isModeLoading &&
        !useCanDataStore.getState().commandOpen
      ) {
        event.preventDefault();
        if (event.code === "F2") ui.toggleDebugMenu();
        else {
          const settings = useRenderSettingsStore.getState();
          if (settings.overlay) closePerformanceOverlay();
          else settings.update({ overlay: true });
        }
        return;
      }
      if (
        event.code === "KeyH" &&
        isDrivingScreen(ui.screen) &&
        !ui.isModeLoading &&
        !useCanDataStore.getState().commandOpen
      ) {
        if (event.shiftKey && canDrive()) {
          event.preventDefault();
          useInputStore.getState().toggleVehicleFlag(VehicleFlags.HAZARDS);
          return;
        }
        if (
          !event.shiftKey &&
          (ui.overlay === null || ui.overlay === "pause")
        ) {
          event.preventDefault();
          release();
          ui.openVehicleSelection();
          return;
        }
      }
      // Focused menu buttons consume activation before this listener. Menu
      // actions always stay separate from driving controls.
      if (
        !ui.isModeLoading &&
        ui.overlay === null &&
        isDrivingScreen(ui.screen) &&
        event.code === "Backquote"
      ) {
        event.preventDefault();
        useCanDataStore
          .getState()
          .setCommandOpen(!useCanDataStore.getState().commandOpen);
        return;
      }
      if (
        ui.screen === "sandbox" &&
        ui.overlay === null &&
        !ui.isModeLoading &&
        !useCanDataStore.getState().commandOpen &&
        event.code === "F8" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        togglePerformanceCapture();
        return;
      }
      // Display policy remains adjustable during the defeated countdown. It
      // never takes a driving key, steals text input or edits combat state.
      if (event.code === usePreferencesStore.getState().bindings.healthBars &&
          !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey &&
          isDrivingScreen(ui.screen) && ui.overlay === null && !ui.isModeLoading &&
          !useCanDataStore.getState().commandOpen && !useTextKeyboardStore.getState().session &&
          !useGameStore.getState().editor && !performanceOverlayHasFocus()) {
        const network=useNetworkStore.getState(),age=performance.now()-(network.snapshot?.received_at_ms??-Infinity);
        if(network.connected && network.getMe() && age>=0 && age<1000){
          event.preventDefault();
          const prefs=usePreferencesStore.getState(),next=cycleHealthBarMode(prefs.healthBars);
          prefs.update({healthBars:next});useChatStore.getState().notify(`Health bars: ${HEALTH_BAR_LABELS[next]}`);
        }
        return;
      }
      if (!canDrive()) {
        release();
        if (useCanDataStore.getState().commandOpen || !canNavigateMenu())
          return;
        const action = MENU_KEYS[event.code];
        if (action) {
          event.preventDefault();
          routeMenuAction(action);
        }
        return;
      }
      const store = useInputStore.getState();
      const combatKeys=usePreferencesStore.getState().bindings;
      if(event.code===combatKeys.headlights && !event.ctrlKey && !event.altKey && !event.metaKey){event.preventDefault();store.toggleVehicleFlag(VehicleFlags.HEADLIGHTS);return;}
      if(event.code===combatKeys.revive&&isMechanicPlayer()){event.preventDefault();void requestNearestRevive();return;}
      if(event.code===combatKeys.barrier&&isDiveShieldPlayer()){event.preventDefault();if(!event.repeat)void requestDiveShield();return;}
      if(event.code===combatKeys.barrier&&isTankBarrierPlayer()){event.preventDefault();if(!event.repeat)void requestTankBarrier();return;}
      if(combatIntent.enabled&&event.code===combatKeys.scope){if(!event.repeat)toggleTankScope();event.preventDefault();return;}
      if((combatIntent.enabled||isMechanicPlayer())&&event.code===combatKeys.fire){
        if(useNetworkStore.getState().getMe()?.vehicle_id==='tank')setWeaponHeld('keyboard','primary',true);
        else combatIntent.keyboardFire=true;
        fireKey=event.code;event.preventDefault();return;
      }
      if(combatIntent.enabled&&event.code===combatKeys.secondaryFire&&useNetworkStore.getState().getMe()?.vehicle_id==='tank'){
        setWeaponHeld('keyboard','secondary',true);secondaryFireKey=event.code;event.preventDefault();return;
      }
      if(combatIntent.enabled&&event.code===combatKeys.nextWeapon){cycleTankWeapon(1);event.preventDefault();return;}
      if(combatIntent.enabled&&event.code===combatKeys.previousWeapon){cycleTankWeapon(-1);event.preventDefault();return;}
      if (event.code === "Escape") {
        event.preventDefault();
        ui.togglePauseMenu();
        return;
      }
      keys.add(event.code);
      if (isAnalogKey(event.code)) {
        event.preventDefault();
        updateAxes();
      } else if (event.code === "PageUp" || event.code === "PageDown") {
        event.preventDefault();
        stepManualGear(event.code === "PageUp" ? 1 : -1);
      } else if (event.code === "KeyT") {
        // Shortcuts use the raw confirmed packet even when every HUD is hidden.
        const network = useNetworkStore.getState(),
          confirmed = network.getMe();
        const version =
          useVehicleConfigStore.getState().byPlayer[network.playerId]
            ?.cockpitVersion ?? 0;
        const age =
          performance.now() - (network.snapshot?.received_at_ms ?? -Infinity);
        if (
          network.connected &&
          confirmed &&
          age >= 0 &&
          age < 500 &&
          version >= 2
        ) {
          if (cockpitStatus(confirmed.cockpit_mask ?? null).tractionLatchedOff || unpackCockpit(confirmed.cockpit_mask).assist === 3) return;
          const enabled = hasFlag(confirmed.vehicle_mask, VehicleFlags.TCS);
          store.setAssist(
            unpackCockpit(confirmed.cockpit_mask).assist === 1
              ? 1
              : enabled
                ? 2
                : 0,
            !enabled,
          );
          tractionHold = window.setTimeout(() => {
            tractionHold = null;
            const current = useNetworkStore.getState(), me = current.getMe();
            const age = performance.now() - (current.snapshot?.received_at_ms ?? -Infinity);
            if (keys.has("KeyT") && canDrive() && current.connected && me && age >= 0 && age < 500 && Math.abs(me.speed ?? Infinity) <= 0.5)
              useInputStore.getState().setAssist(3, false);
          }, 3100);
        } else store.toggleVehicleFlag(VehicleFlags.TCS);
      } else if (VEHICLE_TOGGLES[event.code] !== undefined)
        store.toggleVehicleFlag(VEHICLE_TOGGLES[event.code]);
      else if (PLAYER_TOGGLES[event.code] !== undefined)
        store.togglePlayerFlag(PLAYER_TOGGLES[event.code]);
      else if (event.code === "ShiftLeft"){
        if(useNetworkStore.getState().getMe()?.vehicle_id==='tank'&&combatIntent.enabled)combatIntent.keyboardRam=true;
        else if(isGuardDpsPlayer()){if(!event.repeat)void requestGuardBoost();}
        else store.setHeldVehicleFlag("keyboard", VehicleFlags.BOOST, true);
      }
      else if (event.code === "KeyN")
        store.setHeldPlayerFlag("keyboard", PlayerFlags.HONK, true);
      else if (event.code === "KeyR") {
        if (resetTimer !== null) window.clearTimeout(resetTimer);
        store.setHeldPlayerFlag("keyboard", PlayerFlags.RESET, true);
        resetTimer = window.setTimeout(() => {
          resetTimer = null;
          useInputStore
            .getState()
            .setHeldPlayerFlag("keyboard", PlayerFlags.RESET, false);
        }, 100);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if(event.code===fireKey){setWeaponHeld('keyboard','primary',false);combatIntent.keyboardFire=false;fireKey=null;}
      if(event.code===secondaryFireKey){setWeaponHeld('keyboard','secondary',false);secondaryFireKey=null;}
      // Release a key even if focus moved into an input after its keydown.
      if (event.code === "KeyT" && tractionHold !== null) { window.clearTimeout(tractionHold); tractionHold = null; }
      const owned = keys.delete(event.code);
      if (owned && isAnalogKey(event.code)) updateAxes();
      if(event.code === "ShiftLeft")combatIntent.keyboardRam=false;
      if (event.code === "ShiftLeft")
        useInputStore
          .getState()
          .setHeldVehicleFlag("keyboard", VehicleFlags.BOOST, false);
      if (event.code === "KeyN")
        useInputStore
          .getState()
          .setHeldPlayerFlag("keyboard", PlayerFlags.HONK, false);
    };
    const onBlur = () => {
      focused = false;
      release();
    };
    // A HUD button may still have focus from Tab or a restored browser focus.
    // The driving brake owns this key; consume it before button activation.
    const hudBrakeTarget = (event: KeyboardEvent) =>
      event.code === usePreferencesStore.getState().bindings.brake &&
      event.target instanceof HTMLElement &&
      Boolean(event.target.closest(".driving-hud")) &&
      !isTypingTarget(event.target) &&
      canDrive();
    const onHudBrakeDown = (event: KeyboardEvent) => {
      if (hudBrakeTarget(event)) {
        onKeyDown(event);
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onHudBrakeUp = (event: KeyboardEvent) => {
      if (hudBrakeTarget(event)) {
        onKeyUp(event);
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onFocus = () => {
      focused = true;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") release();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (isTypingTarget(event.target)) release();
    };
    const releaseIfBlocked = () => {
      if (!canDrive()) release();
    };
    // Clear physical key state at the transition, not on the next key press.
    const unsubscribeGame = useGameStore.subscribe(releaseIfBlocked);
    const unsubscribeUI = useUIStore.subscribe(releaseIfBlocked);
    const unsubscribeNetwork=useNetworkStore.subscribe((state,previous)=>{
      if((!state.connected&&previous.connected)||state.playerId!==previous.playerId||
        (state.snapshot?.match_state?.phase==='ended'&&previous.snapshot?.match_state?.phase!=='ended'))release();
    });
    const unsubscribePerformance = usePerformanceOverlayStore.subscribe(
      (state, previous) => {
        if (state.focused !== previous.focused) release();
      },
    );
    const unsubscribeCAN = useCanDataStore.subscribe((state, previous) => {
      if (state.commandOpen && !previous.commandOpen) release();
    });
    const blockTab = (event: KeyboardEvent) => {
      if (event.code === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) {
        // Tab is consumed in capture, before the normal keydown handler. This
        // passive hold never takes steering ownership or opens a modal menu.
        const ui=useUIStore.getState(),network=useNetworkStore.getState();
        const age=performance.now()-(network.snapshot?.received_at_ms??-Infinity);
        const active=useSocialStore.getState().view?.alpha?.active;
        const choosing=!!active && isMatchMode(active.mode) && (ui.screen==='hero_select' && ui.overlay===null || ui.screen==='sandbox' && ui.overlay==='vehicle_select');
        if(!event.defaultPrevented && !event.shiftKey && !event.repeat && focused &&
           document.visibilityState!=='hidden' && !isTypingTarget(event.target) &&
           !ui.isModeLoading &&
           !useCanDataStore.getState().commandOpen && !useTextKeyboardStore.getState().session &&
           !useGameStore.getState().editor && !performanceOverlayHasFocus() &&
           network.connected && (choosing || (ui.screen==='sandbox' && ui.overlay===null && network.getMe() && age>=0 && age<1000))) {
          if (choosing) useScoreboardStore.getState().setView('table');
          setScoreboardHeld(true);
        }
        event.preventDefault(); event.stopPropagation();
      }
    };
    // Capture release even if focus moved into chat or a component consumes it.
    const releaseTab=(event:KeyboardEvent)=>{if(event.code==='Tab')setScoreboardHeld(false);};
    window.addEventListener("keydown", blockTab, true);
    window.addEventListener("keyup", releaseTab, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("keydown", onHudBrakeDown, true);
    window.addEventListener("keyup", onHudBrakeUp, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", blockTab, true);
      window.removeEventListener("keyup", releaseTab, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", onHudBrakeDown, true);
      window.removeEventListener("keyup", onHudBrakeUp, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("focusin", onFocusIn);
      unsubscribeGame();
      unsubscribeUI();
      unsubscribeNetwork();
      unsubscribeCAN();
      unsubscribePerformance();
      release();
    };
  }, []);
  return null;
}
