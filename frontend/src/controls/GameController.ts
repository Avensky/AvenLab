import {barrageReady, requestTankBarrage} from "../combat/tankBarrage";
import {requestNearestRevive,isMechanicPlayer} from '../combat/reviveTargets';
import {isGuardDpsPlayer,requestGuardBoost,requestTankBarrier,requestDiveShield,isDiveShieldPlayer} from '../combat/guardBoost';
import {useScoreboardStore} from "../store/hud/scoreboardStore";
import {controllerDrive} from "./controllerDrive";
import {unpackCockpit} from "../store/input/protocol/cockpitMasks";
import {useNetworkStore} from '../store/session/networkStore';
import {toggleTankScope,resetTurretOrientation,cycleTankWeapon,toggleTurretOrientationLock,setWeaponHeld,releaseWeaponSource} from '../combat/turretControls';
import { aimCombat, combatIntent, useCombatStore } from "../combat/combatStore";
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
import { calibratedSteering, controllerAxis as axis } from "./controllerAxes";
import { routePhysicalMenuPress } from "./physicalMenuPress";
import { togglePerformanceCapture } from "../performance/captureActions";
import {
  minimizePerformanceOverlay,
  performanceOverlayHasFocus,
  togglePerformanceDetails,
  usePerformanceOverlayStore,
} from "../performance/performanceOverlayStore";

function trigger(value = 0) {
  return Number.isFinite(value) && value > 0.05 ? Math.min(1, value) : 0;
}
function menuNeutral(pad: Gamepad) {
  return (
    pad.axes.slice(0, 4).every((value) => axis(value, 0.5) === 0) &&
    [0, 1, 2, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15].every(
      (index) => !pad.buttons[index]?.pressed,
    )
  );
}

export function GameController() {
  useEffect(() => {
    let frameId = 0;
    let focused = document.hasFocus();
    let secondaryFireArmed=true;
    let barragePressStarted: number | null = null;
    let lastSecondary=useCombatStore.getState().secondaryWeapon;
    let previousButtons: boolean[] = [];
    let padKey: string | null = null;
    let armed = false;
    let menuArmed = true;
    let resetTimer: number | null = null;
    let lastVertical = -Infinity;
    let lastHorizontal = -Infinity;
    let panelPressHeld = false;
    let heroMainHeld = false;
    const releaseHeroMain = (cancelled=true) => {
      if(!heroMainHeld)return;heroMainHeld=false;
      window.dispatchEvent(new CustomEvent("avenlab:hero-main-hold",{detail:{pressed:false,cancelled}}));
    };
    const releasePanelPress = (cancelled = true) => {
      releaseWeaponSource("gamepad");combatIntent.gamepadFire=false;combatIntent.gamepadRam=false;
      releaseHeroMain();
      if (!panelPressHeld) return;
      panelPressHeld = false;
      routePhysicalMenuPress(false, cancelled);
    };
    const release = () => {
      barragePressStarted = null;
      releaseWeaponSource("gamepad");combatIntent.gamepadRam=false;combatIntent.gamepadFire=false;
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
        releaseHeroMain();
        release();
        return;
      }
      if (panelPressHeld && !pressed(0)) releasePanelPress(false);
      const ui = useUIStore.getState();
      // Statistics is a passive overlay: ordinary driving continues beneath it.
      // Its B/Close action owns this edge, then requires neutral controls before
      // the same held button can become the driving handbrake again.
      const scoreboard=useScoreboardStore.getState();
      const scoreboardOpen=scoreboard.held||scoreboard.pinned;
      if(scoreboardOpen&&(edges[4]||edges[5])){
        scoreboard.setView(edges[4]?"composition":"table");releasePanelPress();release();return;
      }
      if(edges[1]&&scoreboardOpen){
        scoreboard.close();releasePanelPress();release();return;
      }
      // Team filters own triggers only in the composition view. Holding one
      // after a filter change cannot become throttle/reverse on the next poll.
      if(scoreboardOpen&&scoreboard.view==='composition'&&(pressed(6)||pressed(7))){
        if(edges[6]||edges[7])scoreboard.cycleTeamFilter(edges[6]?-1:1);
        releasePanelPress();release();return;
      }
      // Menu X and driving RB+View open the same chat without changing the
      // existing engine (X) or performance (View) actions during normal driving.
      const keyboardOpen = Boolean(useTextKeyboardStore.getState().session);
      if(edges[2]&&(ui.overlay??ui.screen)==='social'&&!keyboardOpen&&!ui.isModeLoading&&menuArmed&&canNavigateMenu()&&!performanceOverlayHasFocus()&&!isTypingTarget(document.activeElement)){
        // A contextual X action shares the clickable footer control, including
        // its pending/offline guards. Held presses cannot repeat a refresh.
        releasePanelPress();release();
        document.querySelector<HTMLButtonElement>('[data-social-refresh]:not(:disabled)')?.click();
        return;
      }

      const heroHoldAllowed=ui.screen==="heroes"&&ui.overlay===null&&!ui.isModeLoading&&!keyboardOpen&&menuArmed&&canNavigateMenu();
      if(!heroHoldAllowed||!pressed(2))releaseHeroMain(!heroHoldAllowed);
      else if(edges[2]&&!heroMainHeld){heroMainHeld=true;window.dispatchEvent(new CustomEvent("avenlab:hero-main-hold",{detail:{pressed:true}}));}
      if(heroMainHeld){if(edges[1]){releaseHeroMain();routeMenuAction("back");}return;}

      if (
        !keyboardOpen &&
        !ui.isModeLoading &&
        ((edges[2] && ["mode_select", "hero_select"].includes(ui.screen)) ||
          (edges[8] &&
            pressed(5) &&
            ui.screen === "sandbox" &&
            ui.overlay === null &&
            !performanceOverlayHasFocus()))
      ) {
        release();
        window.dispatchEvent(new Event("avenlab:chat-toggle"));
        return;
      }
      if (
        !keyboardOpen &&
        edges[1] &&
        document.activeElement?.closest('.lobby-chat[data-expanded="true"]')
      ) {
        release();
        window.dispatchEvent(new Event("avenlab:chat-close"));
        return;
      }
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
        if ((edges[6] || edges[7]) && ((ui.screen === "mode_select" && ui.overlay === null) || ui.overlay === "match_results")) {
          routeMenuAction(edges[6] ? "previous_option" : "next_option");
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
      const steer = calibratedSteering(pad.axes[0], preferences);
      const tank=useNetworkStore.getState().getMe()?.vehicle_id==='tank';
      const mechanic=isMechanicPlayer();
      const secondary=useCombatStore.getState().secondaryWeapon;
      if(lastSecondary!==secondary){secondaryFireArmed=false;lastSecondary=secondary;}
      if(!pressed(15))secondaryFireArmed=true;
      if (combatIntent.enabled||mechanic) {
        if(tank){
          setWeaponHeld('gamepad','primary',armed&&pressed(5));
          setWeaponHeld('gamepad','secondary',armed&&secondaryFireArmed&&pressed(15));
          combatIntent.gamepadFire=false;
        }else combatIntent.gamepadFire=armed&&pressed(5);
      }else combatIntent.gamepadFire=false;
      if (combatIntent.enabled && armed) aimCombat(axis(pad.axes[2], preferences.controllerDeadzone)*0.035, axis(pad.axes[3], preferences.controllerDeadzone)*0.035);
      const me=useNetworkStore.getState().getMe();
      const transmission=unpackCockpit(me?.cockpit_mask);
      const {throttle,brake}=controllerDrive(
        trigger(pad.buttons[7]?.value),trigger(pad.buttons[6]?.value),
        combatIntent.enabled ? 0 : -axis(pad.axes[3],preferences.controllerDeadzone),
        transmission.automatic&&transmission.gear>=1&&transmission.gear<=6,
      );
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
          pressed(10) ||
          (tank&&(pressed(14)||pressed(15)))
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
      if(mechanic&&edges[4])void requestNearestRevive();
      const guardDps=isGuardDpsPlayer();
      if(guardDps&&edges[4])void requestGuardBoost();
      combatIntent.gamepadRam=tank&&combatIntent.enabled&&armed&&pressed(4);
      store.setHeldVehicleFlag("gamepad", VehicleFlags.BOOST, !tank&&!mechanic&&!guardDps&&pressed(4));
      store.setHeldPlayerFlag("gamepad", PlayerFlags.HONK, !combatIntent.enabled&&!mechanic && pressed(5));
      if (edges[2]) store.toggleVehicleFlag(VehicleFlags.ENGINE_ON);
      if (edges[3]) {if(cycleTankWeapon())secondaryFireArmed=false;else store.toggleVehicleFlag(VehicleFlags.HEADLIGHTS);}
      if (edges[12]) {
        if (combatIntent.enabled && barrageReady(useNetworkStore.getState())) barragePressStarted = performance.now();
        else if(tank) resetTurretOrientation();
        else store.toggleVehicleFlag(VehicleFlags.HAZARDS);
      }
      if (barragePressStarted !== null) {
        if (!combatIntent.enabled) barragePressStarted = null;
        else if (!pressed(12)) {
          barragePressStarted = null;
          if(tank) resetTurretOrientation();
          else store.toggleVehicleFlag(VehicleFlags.HAZARDS);
        } else if (performance.now() - barragePressStarted >= 600) {
          barragePressStarted = null;
          void requestTankBarrage();
        }
      }
      if (edges[14]) {if(tank)void requestTankBarrier();else if(isDiveShieldPlayer()&&combatIntent.enabled)void requestDiveShield();else store.toggleVehicleFlag(VehicleFlags.BLINKER_LEFT);}
      if (edges[15]&&!(tank&&combatIntent.enabled)) store.toggleVehicleFlag(VehicleFlags.BLINKER_RIGHT);
      if (edges[11]) {
        if(combatIntent.enabled)toggleTurretOrientationLock();
        else if(!stepManualGear(-1))store.togglePlayerFlag(PlayerFlags.DYNO);
      }
      if (edges[13]) {if(!toggleTankScope())store.togglePlayerFlag(PlayerFlags.RADIO);}
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
