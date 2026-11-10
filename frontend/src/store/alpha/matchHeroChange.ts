import { snapshotEntity } from "../session/networkStore";
import { useMotionView, type MotionState } from "../session/networkViews";
import { useSocialStore } from "../social/socialStore";
import { ResourceFlags } from "../telemetry/resourceMasks";
import { isMatchMode, type AlphaView } from "./alphaStore";

type Admission = AlphaView["active"] | undefined;

export function isCurrentMatchRound(state: MotionState, active: Admission): active is NonNullable<Admission> {
  const round = state.snapshot?.match_state;
  return Boolean(active?.match_id && round?.match_id === active.match_id && round.phase !== "ended" &&
    state.connected && state.room_id === active.world_id && isMatchMode(active.mode));
}

export function canChangeMatchHero(state: MotionState, active: Admission) {
  if (!isCurrentMatchRound(state, active)) return false;
  const vehicle = snapshotEntity(state.snapshot, state.playerId);
  return vehicle?.room_id === active.world_id && vehicle.team === active.team &&
    !vehicle.health?.defeated &&
    Boolean((vehicle.resource_mask ?? 0) & ResourceFlags.CAN_CHANGE_HERO);
}

function vehicleSelectionAvailable(state: MotionState, active: Admission) {
  return (active && isMatchMode(active.mode)) || state.snapshot?.match_state
    ? canChangeMatchHero(state, active)
    : true;
}

export function canOpenVehicleSelection() {
  return vehicleSelectionAvailable(useMotionView.getState(), useSocialStore.getState().view?.alpha?.active);
}

export function useVehicleSelectionAvailable() {
  const active = useSocialStore(state => state.view?.alpha?.active);
  return useMotionView(state => vehicleSelectionAvailable(state, active));
}
