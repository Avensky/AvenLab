import { useFrame } from '@react-three/fiber';
import { useUIStore } from '../../store/menus/uiStore';
import { useScoreboardVisible } from './useScoreboardVisible';

// A positive-priority subscriber takes ownership of the final WebGL draw.
// The opaque overlay supplies the image. Frame callbacks, input and clocks keep
// running, and removing the subscriber restores R3F's normal draw immediately.
function CoveredFrame() {
  useFrame(() => {}, 1);
  return null;
}
export function ScoreboardSceneCover() {
  const scoreboard = useScoreboardVisible();
  const lineup = useUIStore(state => state.overlay === 'team_lineup');
  return scoreboard || lineup ? <CoveredFrame /> : null;
}
