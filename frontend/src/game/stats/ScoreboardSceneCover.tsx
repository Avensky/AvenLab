import { useFrame } from '@react-three/fiber';
import { useScoreboardVisible } from './useScoreboardVisible';

// A positive-priority subscriber takes ownership of the final WebGL draw.
// The opaque board supplies the image. Frame callbacks, input and clocks keep
// running, and removing the subscriber restores R3F's normal draw immediately.
function CoveredFrame() {
  useFrame(() => {}, 1);
  return null;
}
export function ScoreboardSceneCover() {
  return useScoreboardVisible() ? <CoveredFrame /> : null;
}
