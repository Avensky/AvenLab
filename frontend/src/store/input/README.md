# Requested driving input

Import the public API from `store/input/index.ts`. Modules inside this section use direct sibling imports to avoid cycles.

| File | Owns |
| --- | --- |
| [inputStore.ts](inputStore.ts) | Single merge/validation point for device intent; inputRef is read by the sender. Owns source releases and menu brake. |
| [protocol/](protocol/) | Packed vehicle/player/cockpit/cabin masks and derived pedal flags. |

## Editing recipe

Add a keyboard, controller or touch action using setAnalogFromSource / held-flag actions. Never mutate inputRef. Rust confirms requests in telemetry. Physical sources cannot release the menu brake. Pause/world-editor route transitions hold the service brake with zero throttle while Pause, the world editor or their child menus are open; closing releases it and requires renewed device input.

`setHeadlightFlash(source, held, confirmedCabin)` owns cabin bit 20 separately
for each source. An idle keyboard/controller cannot release a stalk hold.
releaseInputSource clears only that source; releaseControls clears every
transient hold, returns START to ON, and preserves pending OFF/ACC/ON commands.
This requires cockpit version 6; update Rust, the config parser and telemetry
mask limit together when adding a protocol capability.

See [all state owners](../README.md) and the [project guide](../../../../docs/PROJECT_GUIDE.md).

`setParkingBrake(fraction)` validates a 0–1 deliberate cable latch for cockpit v7. It writes `parking_brake` independently of other packed commands, using the existing sender. releaseControls clears transient input while preserving this latch. The HUD and cockpit use the same progressive control; explicit zero releases it. `touch-parking` remains an available analog source for older/experimental momentary controls. Keyboard/controller analog handbrake still merges separately using maximum force.
