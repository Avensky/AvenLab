import { useInputStore } from "../../../store/input/inputStore";
import {
  VehicleFlags,
  hasFlag,
  setFlag,
} from "../../../store/input/protocol/inputMasks";

/** Requested detent, shared by the wheel lever and cockpit's vertical buttons. */
function signalDirection() {
  const flags = useInputStore.getState().input.vehicleMask;
  return hasFlag(flags, VehicleFlags.BLINKER_RIGHT)
    ? 1
    : hasFlag(flags, VehicleFlags.BLINKER_LEFT)
      ? -1
      : 0;
}

/** A physical turn lever cannot latch both directions. Hazards stay separate. */
export function requestTurnSignal(direction: -1 | 0 | 1) {
  const store = useInputStore.getState(),
    flags = store.input.vehicleMask;
  store.setInput({
    vehicleMask: setFlag(
      setFlag(flags, VehicleFlags.BLINKER_LEFT, direction === -1),
      VehicleFlags.BLINKER_RIGHT,
      direction === 1,
    ),
  });
}
export function stepTurnSignal(direction: -1 | 1) {
  requestTurnSignal(
    Math.max(-1, Math.min(1, signalDirection() + direction)) as -1 | 0 | 1,
  );
}
export function toggleTurnSignal(direction: -1 | 1) {
  requestTurnSignal(signalDirection() === direction ? 0 : direction);
}
