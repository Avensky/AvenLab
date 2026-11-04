import { useScoreboardStore } from '../../store/hud/scoreboardStore';
import { useUIStore } from '../../store/menus/uiStore';
import { useNetworkStore } from '../../store/session/networkStore';

export function useScoreboardVisible() {
  const open = useScoreboardStore(s => s.held || s.pinned);
  const allowed = useUIStore(s => !s.isModeLoading && (
    (s.screen === 'sandbox' && (s.overlay === null || s.overlay === 'vehicle_select')) ||
    (s.screen === 'hero_select' && s.overlay === null)
  ));
  const connected = useNetworkStore(s => s.connected);
  return open && allowed && connected;
}
