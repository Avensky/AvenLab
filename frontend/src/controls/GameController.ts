// src/components/GameController.tsx

import { useRef, useEffect } from 'react';
import { useInputStore, useSelectionStore, useUIStore } from "../store";
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

    const lastMenuMoveRef = useRef(0);
    const lastMenuHorizontalRef = useRef(0);
    const debugGamepadRef = useRef(createGamepadDebugLogger());

    useEffect(() => {
        let frameId: number;
        const pollGamepad = () => {
            const gamepads = navigator.getGamepads?.() ?? [];
            const gp = gamepads[0]; // just grab the first for now
            const store = useInputStore.getState();

            if (gp) {
                const ui = useUIStore.getState();
                const inMenu =
                  ui.screen === "main" ||
                  ui.screen === "settings" ||
                  ui.screen === "sandbox_setup" ||
                  ui.overlay === "pause"||
                  ui.overlay === "settings"||
                  ui.overlay === "debug_menu"||
                  ui.overlay === "vehicle_select";

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


                const now = performance.now();

                const leftStickX = applyDeadzone(gp.axes[0] ?? 0, 0.45);
                const leftStickY = applyDeadzone(gp.axes[1] ?? 0, 0.45);
                const rightStickX = applyDeadzone(gp.axes[2] ?? 0, 0.45);
                const rightStickY = applyDeadzone(gp.axes[3] ?? 0, 0.45);

                const isDebugMenu = ui.overlay === "debug_menu";

                if (isDebugMenu) {
                  const dispatchDebugMenuEvent = (
                    action: "up" | "down" | "left" | "right" | "activate" | "back"
                  ) => {
                    window.dispatchEvent(
                      new Event(`avenlab:debug-menu-${action}`)
                    );
                  };

                  if (now - lastMenuMoveRef.current > 220) {
                    if (leftStickY < -0.5 || rightStickY < -0.5) {
                      dispatchDebugMenuEvent("up");
                      lastMenuMoveRef.current = now;
                    } else if (leftStickY > 0.5 || rightStickY > 0.5) {
                      dispatchDebugMenuEvent("down");
                      lastMenuMoveRef.current = now;
                    }
                  }

                  if (now - lastMenuHorizontalRef.current > 220) {
                    if (leftStickX < -0.5 || rightStickX < -0.5) {
                      dispatchDebugMenuEvent("left");
                      lastMenuHorizontalRef.current = now;
                    } else if (leftStickX > 0.5 || rightStickX > 0.5) {
                      dispatchDebugMenuEvent("right");
                      lastMenuHorizontalRef.current = now;
                    }
                  }

                  onPress(12, () => dispatchDebugMenuEvent("up"));
                  onPress(13, () => dispatchDebugMenuEvent("down"));
                  onPress(14, () => dispatchDebugMenuEvent("left"));
                  onPress(15, () => dispatchDebugMenuEvent("right"));
                  onPress(0, () => dispatchDebugMenuEvent("activate"));
                  onPress(1, () => dispatchDebugMenuEvent("back"));

                  frameId = requestAnimationFrame(pollGamepad);
                  return;
                }

                const isSandboxSetup = ui.screen === "sandbox_setup";

                // On the main and Sandbox setup screens, either stick may
                // navigate vertically. Use the stronger input so the two
                // sticks cannot produce duplicate moves in the same poll.
                // Use only the stick with the stronger input so moving both
                // sticks cannot trigger two menu steps during the same poll.
                const menuVerticalAxis =
                  (ui.screen === "main" || isSandboxSetup) &&
                  Math.abs(rightStickY) > Math.abs(leftStickY)
                    ? rightStickY
                    : leftStickY;

                const menuHorizontalAxis =
                  isSandboxSetup &&
                  Math.abs(rightStickX) > Math.abs(leftStickX)
                    ? rightStickX
                    : leftStickX;

                const moveSandboxRow = (direction: -1 | 1) => {
                  const sandboxIndex =
                    useUIStore.getState().selectedMenuIndexById.sandbox_setup;
                  const nextIndex = (sandboxIndex + direction + 2) % 2;
                  useUIStore.getState().setActiveMenuIndex(nextIndex);
                };

                const moveMenuVertically = (direction: -1 | 1) => {
                  if (isSandboxSetup) {
                    moveSandboxRow(direction);
                    return;
                  }
                  useUIStore.getState().moveActiveMenuSelection(direction);
                };

                const moveMenuHorizontally = (direction: -1 | 1) => {
                  if (!isSandboxSetup) {
                    useUIStore.getState().moveActiveMenuHorizontal(direction);
                    return;
                  }

                  const sandboxIndex =
                    useUIStore.getState().selectedMenuIndexById.sandbox_setup;
                  const selection = useSelectionStore.getState();

                  if (sandboxIndex === 0) {
                    if (direction < 0) {
                      selection.prevVehicle();
                    } else {
                      selection.nextVehicle();
                    }
                  } else if (sandboxIndex === 1) {
                    if (direction < 0) {
                      selection.prevMap();
                    } else {
                      selection.nextMap();
                    }
                  }
                };

                if (inMenu) {
                  if (now - lastMenuMoveRef.current > 220) {
                    if (menuVerticalAxis < -0.5) {
                      moveMenuVertically(-1);
                      lastMenuMoveRef.current = now;
                    }

                    if (menuVerticalAxis > 0.5) {
                      moveMenuVertically(1);
                      lastMenuMoveRef.current = now;
                    }
                  }

                  if (now - lastMenuHorizontalRef.current > 220) {
                    if (menuHorizontalAxis < -0.5) {
                      moveMenuHorizontally(-1);
                      lastMenuHorizontalRef.current = now;
                    }

                    if (menuHorizontalAxis > 0.5) {
                      moveMenuHorizontally(1);
                      lastMenuHorizontalRef.current = now;
                    }
                  }

                  onPress(12, () => moveMenuVertically(-1));
                  onPress(13, () => moveMenuVertically(1));
                  onPress(14, () => moveMenuHorizontally(-1));
                  onPress(15, () => moveMenuHorizontally(1));
                  
                  onPress(0, () => {
                    const currentUi = useUIStore.getState();
                    if (currentUi.screen === "sandbox_setup") {
                      window.dispatchEvent(new Event("avenlab:sandbox-start"));
                      return;
                    }

                    // Open the debugger explicitly from the pause menu. This
                    // keeps controller access working even if the generic UI
                    // action table has not added a debugger entry yet.
                    if (
                      currentUi.overlay === "pause" &&
                      currentUi.selectedMenuIndexById.pause === 1
                    ) {
                      useUIStore.setState({ overlay: "debug_menu" });
                      return;
                    }

                    currentUi.activateActiveMenuSelection();
                  });
                  onPress(1, () => {
                    const currentUi = useUIStore.getState();
                    if (currentUi.screen === "sandbox_setup") {
                      window.dispatchEvent(new Event("avenlab:sandbox-exit"));
                      return;
                    }
                    currentUi.closeOverlay();
                  });
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
