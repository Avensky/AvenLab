import {
  CAN_INTERFACE_OPTIONS,
  CAN_MODE_OPTIONS,
  useCanBusStore,
  type CanInterface,
  type CanMode,
  type CanBusStatus,
} from "./canBusStore";
import { useSelectionStore } from "../selection/selectionStore";
import { useSignalReconStore } from "./store";

/** Existing setup/workspace and garage controls share the same values and order. */
export function cycleCanInterface(direction: number) {
  const state = useCanBusStore.getState(),
    index = CAN_INTERFACE_OPTIONS.indexOf(state.selectedInterface);
  state.setSelectedInterface(
    CAN_INTERFACE_OPTIONS[
      (index + direction + CAN_INTERFACE_OPTIONS.length) %
        CAN_INTERFACE_OPTIONS.length
    ],
  );
}
export function cycleCaptureMode(direction: number) {
  const state = useCanBusStore.getState(),
    index = CAN_MODE_OPTIONS.indexOf(state.selectedMode);
  state.setSelectedMode(
    CAN_MODE_OPTIONS[
      (index + direction + CAN_MODE_OPTIONS.length) % CAN_MODE_OPTIONS.length
    ],
  );
}
export function captureReady(
  iface: CanInterface,
  mode: CanMode,
  status: CanBusStatus | null,
) {
  return (
    mode === "simulation" ||
    iface === "vcan0" ||
    Boolean(status?.[iface]?.exists && status[iface]?.up)
  );
}
/** Validate the real selected interface, then copy the current vehicle's CAN
 * identity. This does not spawn a vehicle or start physical CAN transmission. */
export function prepareReconSelection() {
  const state = useCanBusStore.getState();
  if (
    !captureReady(state.selectedInterface, state.selectedMode, state.status)
  ) {
    void state.refreshStatus();
    const reason = state.status?.[state.selectedInterface]?.exists
      ? "down"
      : "unavailable";
    throw Error(
      `${state.selectedInterface} is ${reason}. Choose an active interface or Simulation.`,
    );
  }
  useSignalReconStore
    .getState()
    .setVehicleIdentity(
      useSelectionStore.getState().getSelectedVehicle().canIdentity,
    );
}
