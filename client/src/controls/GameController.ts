// src/components/GameController.tsx

import { useRef } from 'react';
import { useEffect } from 'react';
import { useStore } from '../store';
import type { Controls } from '../store';
import socket from '../socket';

/**
 * Simple deadzone filter for single-axis drift.
 * Zeroes small values to prevent unwanted steering.
 */

function applyDeadzone(value: number, deadzone = 0.1) {
    return Math.abs(value) < deadzone ? 0 : value;
}

export function GameController() {
    const prevButtons = useRef<boolean[]>([]);

    useEffect(() => {
        let animationFrameId: number;
        const pollGamepad = () => {
            const gamepads = navigator.getGamepads();
            const gp = gamepads[0]; // just grab the first for now
            if (gp) {
                // Example: Left stick X-axis for steering
                const rawSteeringAxis = gp.axes[0] ?? 0;
                const rawThrottleAxis = gp.axes[3] ?? 0;

                const steeringAxis = applyDeadzone(rawSteeringAxis, 0.1);  // tweak as needed
                const throttleAxis = applyDeadzone(rawThrottleAxis, 0.1);  // optional: only if needed

                // Update local store — does NOT emit yet:
                // This ensures your store always has up-to-date analog inputs.
                useStore.getState().setControls({
                    steering: steeringAxis,
                    throttle: -throttleAxis, // stick up = forward
                    brake: gp.buttons[6]?.value > 0.1,
                    handbrake: gp.buttons[1]?.pressed ?? false,
                    left: steeringAxis < -0.2,
                    right: steeringAxis > 0.2,
                    forward: throttleAxis < -0.2,
                    backward: throttleAxis > 0.2,
                    honk: gp.buttons[11]?.pressed,
                    boost: gp.buttons[4]?.pressed,
                });

                // This makes toggles appear in the same Zustand controls.
                function toggleControl(key: keyof Controls, index: number) {
                    const pressed = gp?.buttons[index]?.pressed ?? false;
                    if (pressed && !prevButtons.current[index]) {
                        const current = useStore.getState().controls[key];
                        useStore.getState().setControls({ [key]: !current });
                        // console.log(`Toggled ${key}: ${!current}`);
                    }
                    prevButtons.current[index] = pressed;
                }

                // ✅ Add all your toggle buttons here
                toggleControl('engineOn', 2);       // Square button
                toggleControl('hazards', 12);       // D-Pad up
                toggleControl('headlights', 13);    // D-Pad down
                toggleControl('reset', 9);          // menu
                toggleControl('blinkerLeft', 14);   // D-Pad Left
                toggleControl('blinkerRight', 15);  // D-Pad Right

                // Emit ALL controls once, merged:
                socket.emit('controls', useStore.getState().controls);
            }
            animationFrameId = requestAnimationFrame(pollGamepad);
        };
        animationFrameId = requestAnimationFrame(pollGamepad);
        return () => cancelAnimationFrame(animationFrameId);
    }, []);

    return null; // no UI needed
}
