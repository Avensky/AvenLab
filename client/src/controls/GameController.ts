// src/components/GameController.tsx

import { useRef, useEffect } from 'react';
import { useInputStore, useUIStore } from "../store";
import { VehicleFlags, PlayerFlags } from "../store/tools/inputMasks";

/**
 * Simple deadzone filter for single-axis drift.
 * Zeroes small values to prevent unwanted steering.
**/

function applyDeadzone(value: number, deadzone = 0.12) {
    return Math.abs(value) < deadzone ? 0 : value;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function pulsePlayerFlag(flag: number, ms = 100) {
    const store = useInputStore.getState();
    store.setPlayerFlag(flag, true);
    window.setTimeout(() => {
        useInputStore.getState().setPlayerFlag(flag, false);
    }, ms);
}

function createGamepadDebugLogger() {
  const prevButtons: boolean[] = [];
  const prevAxes: number[] = [];

  return function debugGamepad(gp: Gamepad) {
    gp.buttons.forEach((button, index) => {
      const pressed = button.pressed;
      const wasPressed = prevButtons[index] ?? false;

      if (pressed !== wasPressed) {
        console.log(
          `[GAMEPAD BUTTON] index=${index} pressed=${pressed} value=${button.value}`
        );
      }

      prevButtons[index] = pressed;
    });

    gp.axes.forEach((value, index) => {
      const prev = prevAxes[index] ?? 0;

      // Only log big axis changes
      if (Math.abs(value - prev) > 0.25) {
        console.log(`[GAMEPAD AXIS] index=${index} value=${value.toFixed(3)}`);
      }

      prevAxes[index] = value;
    });
  };
}

export function GameController() {
    const prevButtons = useRef<boolean[]>([]);

    const ui = useUIStore.getState();
    const inMenu =
      ui.screen === "main" ||
      ui.screen === "settings" ||
      ui.overlay === "pause"||
      ui.overlay === "settings"||
      ui.overlay === "vehicle_select";

    const debugGamepadRef = useRef(createGamepadDebugLogger());

    useEffect(() => {
        let frameId: number;
        const pollGamepad = () => {
            const gamepads = navigator.getGamepads?.() ?? [];
            const gp = gamepads[0]; // just grab the first for now
            const store = useInputStore.getState();

            if (gp) {

                debugGamepadRef.current(gp);
                
                // Example: Left stick X-axis for steering
                const rawSteeringAxis = gp.axes[0] ?? 0; // Left stick X-axis for steering (common mapping, but may vary)
                const rawThrottleAxis = gp.axes[3] ?? 0; // Right stick Y-axis for throttle (common mapping, but may vary)
                
                const steeringAxis = applyDeadzone(rawSteeringAxis, 0.12);  // tweak as needed
                const throttleAxis = applyDeadzone(rawThrottleAxis, 0.12);  // optional: only if needed
                
                const triggerBrake = clamp01(gp.buttons[6]?.value ?? 0);
                const triggerThrottle = clamp01(gp.buttons[7]?.value ?? 0);
                
                // Fallback: allow left stick up/down as throttle if triggers are not used
                const stickThrottle = throttleAxis < 0 ? Math.abs(throttleAxis) : 0;
                const stickReverse = throttleAxis > 0 ? -throttleAxis : 0;
                
                const throttle = triggerThrottle > 0.05 
                    ? triggerThrottle 
                    : stickThrottle + stickReverse;

                const brake = triggerBrake;

                const handbrake = gp.buttons[1]?.pressed ? 1 : 0; // B / Circle

                useInputStore.getState().setAnalog({
                    throttle,
                    steer: steeringAxis,
                    brake,
                    handbrake,
                });
                
                const onPress = (index: number, action: () => void) => {
                    const pressed = gp.buttons[index]?.pressed ?? false;
                    if (pressed && !prevButtons.current[index]) { action();}
                    prevButtons.current[index] = pressed;
                };
                
                const holdButton = (index: number, onHold: (pressed: boolean) => void) => {
                    const pressed = gp.buttons[index]?.pressed ?? false;
                    onHold(pressed);
                    prevButtons.current[index] = pressed;
                };

                if (inMenu) {
                    onPress(12, () => {useUIStore.getState().moveActiveMenuSelection(-1);});
                    onPress(13, () => {useUIStore.getState().moveActiveMenuSelection(1);});
                    onPress(0,  () => {useUIStore.getState().activateActiveMenuSelection();});
                    onPress(1,  () => {useUIStore.getState().closeOverlay();});
                    onPress(9,  () => {useUIStore.getState().togglePauseMenu();});

                    frameId = requestAnimationFrame(pollGamepad);
                    return;
                }

                // --------------------
                // Vehicle toggles
                // --------------------

                onPress(2,  () => {store.toggleVehicleFlag(VehicleFlags.ENGINE_ON);});// X / Square
                onPress(3,  () => {store.toggleVehicleFlag(VehicleFlags.HEADLIGHTS);}); // Y / Triangle
                onPress(12, () => {store.toggleVehicleFlag(VehicleFlags.HAZARDS);});// D-pad up
                onPress(14, () => {store.toggleVehicleFlag(VehicleFlags.BLINKER_LEFT);});// D-pad left
                onPress(15, () => {store.toggleVehicleFlag(VehicleFlags.BLINKER_RIGHT);});// D-pad right

                // Boost / nitrous = hold
                holdButton(4, (pressed) => {store.setVehicleFlag(VehicleFlags.BOOST, pressed);});// LB / L1

                // Honk = hold
                holdButton(5, (pressed) => {store.setPlayerFlag(PlayerFlags.HONK, pressed);});// RB / R1

                // --------------------
                // Player / research tools
                // --------------------
                onPress(8, () => {store.togglePlayerFlag(PlayerFlags.CANDUMP);});// Select / Back
                onPress(9, () => {useUIStore.getState().togglePauseMenu();});// Start / Menu
                onPress(10, () => {pulsePlayerFlag(PlayerFlags.RESET);});// Reset vehicle state
                // onPress(10, () => {store.togglePlayerFlag(PlayerFlags.LIVECAN);});// Left stick press
                onPress(11, () => {store.togglePlayerFlag(PlayerFlags.DYNO);});// Right stick press
                onPress(13, () => {store.togglePlayerFlag(PlayerFlags.RADIO);}); // D-pad down
            }

            frameId = requestAnimationFrame(pollGamepad);
        };
        
        frameId = requestAnimationFrame(pollGamepad);
        return () => cancelAnimationFrame(frameId);
    }, []);

    return null; // no UI needed
}
