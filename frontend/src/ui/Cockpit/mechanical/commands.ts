import { useInputStore } from "../../../store/input/inputStore";

/** One explicit cable-latch request shared by both appearances and input modes.
 * Command 3 preserves the current gear and assist request; it never sends gas. */
export function requestParkingStrength(value: number) {
  const level = Number.isFinite(value)
    ? Math.max(0, Math.min(3, Math.round(value)))
    : 0;
  useInputStore
    .getState()
    .setCockpit({ parking: level > 0, parkingStrength: level }, 3);
}
