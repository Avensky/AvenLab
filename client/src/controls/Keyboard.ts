import { useEffect, useRef } from "react";
import { VehicleFlags, PlayerFlags } from "../store/tools/inputMasks";
import { useInputStore, useUIStore } from "../store";

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;

  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable
  );
}

export function Keyboard() {
  const setInput = useInputStore((s) => s.setInput);

  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const recomputeAxes = () => {
      const k = keys.current;

      let throttle = 0;
      if (k["KeyW"]) throttle += 1;
      if (k["KeyS"]) throttle -= 1;

      let steer = 0;
      if (k["KeyA"]) steer -= 1;
      if (k["KeyD"]) steer += 1;

      const brake = k["Space"] ? 1 : 0;
      const handbrake = k["KeyB"] ? 1 : 0;

      setInput({ throttle, steer, brake, handbrake });
    };

    const pulsePlayerFlag = (flag: number, ms = 100) => {
      const store = useInputStore.getState();

      store.setPlayerFlag(flag, true);

      window.setTimeout(() => {
        useInputStore.getState().setPlayerFlag(flag, false);
      }, ms);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.repeat) return;

      const ui = useUIStore.getState();
      const inMenu = ui.screen === "main" || ui.screen === "settings" || ui.overlay === "pause";
      const store = useInputStore.getState();

      if (inMenu) {
        switch (e.code) {
          case "ArrowUp":
          case "KeyW":
            e.preventDefault();
            ui.moveActiveMenuSelection(-1);
            return;

          case "ArrowDown":
          case "KeyS":
            e.preventDefault();
            ui.moveActiveMenuSelection(1);
            return;

          case "Enter":
          case "Space":
            e.preventDefault();
            ui.activateActiveMenuSelection();
            return;

          case "Escape":
            e.preventDefault();
            // ui.setScreen("main");
            useUIStore.getState().togglePauseMenu();
            return;
        }
      }

      keys.current[e.code] = true;

      switch (e.code) {
        case "KeyW":
        case "KeyS":
        case "KeyA":
        case "KeyD":
        case "Space":
        case "KeyB":
          e.preventDefault();
          recomputeAxes();
          break;

        // Vehicle toggles
        case "KeyE":
          store.toggleVehicleFlag(VehicleFlags.ENGINE_ON);
          break;

        case "KeyL":
          store.toggleVehicleFlag(VehicleFlags.HEADLIGHTS);
          break;

        case "KeyZ":
          store.toggleVehicleFlag(VehicleFlags.BLINKER_LEFT);
          break;

        case "KeyX":
          store.toggleVehicleFlag(VehicleFlags.BLINKER_RIGHT);
          break;

        case "KeyH":
          store.toggleVehicleFlag(VehicleFlags.HAZARDS);
          break;

        case "KeyQ":
          store.toggleVehicleFlag(VehicleFlags.ABS);
          break;

        case "KeyT":
          store.toggleVehicleFlag(VehicleFlags.TCS);
          break;

        // Boost should be hold
        case "ShiftLeft":
          store.setVehicleFlag(VehicleFlags.BOOST, true);
          break;

        // Player / research tools
        case "KeyR":
          pulsePlayerFlag(PlayerFlags.RESET);
          break;

        case "KeyC":
          store.togglePlayerFlag(PlayerFlags.CANDUMP);
          break;

        case "KeyV":
          store.togglePlayerFlag(PlayerFlags.LIVECAN);
          break;

        case "KeyY":
          store.togglePlayerFlag(PlayerFlags.DYNO);
          break;

        case "KeyM":
          store.togglePlayerFlag(PlayerFlags.RADIO);
          break;

        case "KeyN":
          store.setPlayerFlag(PlayerFlags.HONK, true);
          break;

        case "Escape":
          e.preventDefault();
          useUIStore.getState().togglePauseMenu();
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // e.preventDefault();

      if (isTypingTarget(e.target)) return;

      keys.current[e.code] = false;

      const store = useInputStore.getState();

      switch (e.code) {
        case "KeyW":
        case "KeyS":
        case "KeyA":
        case "KeyD":
        case "Space":
        case "KeyB":
          recomputeAxes();
          break;

        case "ShiftLeft":
          store.setVehicleFlag(VehicleFlags.BOOST, false);
          break;

        case "KeyN":
          store.setPlayerFlag(PlayerFlags.HONK, false);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [setInput]);

  return null;
}