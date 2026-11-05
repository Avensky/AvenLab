# useInputStore

Merges requested keyboard, gamepad, touch and cockpit controls. The network sender samples the separate inputRef.

**Expected updates** · Device events and controller samples.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `input`, `controls` | Device contributions, pedal values, flags, cabin/cockpit commands, parking latch and menu/release actions. | On input. Packed transport samples a live visible driver at 60 Hz by default. Changes send at the next sample and identical held inputs refresh after 100 ms. |

[Implementation](inputStore.ts) · [All store update rates](../README.md)

[deviceAnalog.ts](deviceAnalog.ts) owns each device's last axes and the merged analog intent. It recomputes the merge on a source change or release. An unchanged gamepad poll checks the effective packet, including the menu brake, before entering packet validation. A conflicting direct analog write is corrected on the next device poll. Held flag ownership is still tracked independently of the effective bitmask.
