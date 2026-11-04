import {useEffect} from "react";
import {useShallow} from "zustand/react/shallow";
import {useNetworkStore} from "../store/session/networkStore";
import {useSocialStore} from "../store/social/socialStore";
import {useUIStore} from "../store/menus/uiStore";
import {usePreferencesStore} from "../store/preferences/preferencesStore";
import {UI_THEMES} from "./catalog";
import {applyMatchTeamTheme, confirmedMatchTeam} from "./matchTeamTheme";
import "./matchTeamTheme.css";

/** Primitive identity subscriptions keep nearby vehicle snapshots from
 * invalidating the global theme or restarting HUD effects. */
export function useMatchTeamTheme() {
  const ui = useUIStore(useShallow(state => ({screen: state.screen, loading: state.isModeLoading})));
  const active = useSocialStore(useShallow(state => ({
    activeMode: state.view?.alpha?.active?.mode,
    activeWorld: state.view?.alpha?.active?.world_id,
    activeTeam: state.view?.alpha?.active?.team,
  })));
  const network = useNetworkStore(useShallow(state => {
    const me = state.getMe();
    return {
      connected: state.connected, playerId: state.playerId, roomId: state.room_id,
      entityId: me?.id, entityRoom: me?.room_id, entityTeam: me?.team,
      matchMode: state.snapshot?.match_state?.mode,
    };
  }));
  const scheme = usePreferencesStore(state => UI_THEMES[state.theme].scheme);
  const team = confirmedMatchTeam({...ui, ...active, ...network});
  useEffect(() => {
    const root = document.documentElement;
    applyMatchTeamTheme(root, team, scheme);
    return () => applyMatchTeamTheme(root, null, scheme);
  }, [team, scheme]);
}
