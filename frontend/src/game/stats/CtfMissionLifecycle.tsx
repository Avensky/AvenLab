import { useEffect } from "react";
import { useNetworkStore } from "../../store/session/networkStore";
import { useUIStore } from "../../store/menus/uiStore";
import { useMissionRadioStore } from "../../store/missions/missionRadioStore";
import { createCtfEventObserver, flagEventNotice } from "./ctfMissionEvents";
import { clearCaptureFeedback, showCaptureFeedback } from "./ctfFeedbackStore";

/** Collect even when the Missions panel is hidden. No client event awards a
 * capture; the server-owned objective event is the only confirmation source. */
export function CtfMissionLifecycle() {
  useEffect(() => {
    const observe = createCtfEventObserver();
    let active: string | null = null, phase: string | null = null;
    const sync = () => {
      const network = useNetworkStore.getState(), ui = useUIStore.getState();
      if (ui.screen !== "sandbox") {
        if (active) { useMissionRadioStore.getState().clearSource("ctf"); clearCaptureFeedback(); }
        active = null; phase = null; observe(null, null, -1); return;
      }
      // A transport interruption is not a new round. Keep the cursor until a
      // different player/world/match identity supplies an authoritative frame.
      if (!network.connected || ui.isModeLoading) return;
      const snapshot = network.snapshot, match = snapshot?.match_state, me = network.getMe();
      if (!snapshot || !match || !me || me.room_id !== (network.room_id ?? me.room_id)) return;
      const key = `${network.playerId}:${me.room_id}:${match.match_id}`;
      if (active !== key || phase === "waiting" && match.phase === "running") { useMissionRadioStore.getState().clearSource("ctf"); clearCaptureFeedback(); active = key; }
      phase = match.phase;
      for (const event of observe(key, match, snapshot.tick)) {
        useMissionRadioStore.getState().publish(flagEventNotice(event, network.playerId));
        if (event.kind === "captured" && (me.team === "red" || me.team === "blue") && event.flag_team !== me.team && !event.warmup) {
          showCaptureFeedback({ id: event.id, team: me.team, at: performance.now() });
        }
      }
    };
    sync();
    const offNetwork = useNetworkStore.subscribe(sync), offUI = useUIStore.subscribe(sync);
    return () => { offNetwork(); offUI(); };
  }, []);
  return null;
}
