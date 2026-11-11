import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { GARAGE_LIGHT_COLORS } from "../../theme/garageLighting";
import { isCompactPreview } from "../preview/previewBudget";
import { createFittingRoomMirror, FITTING_WALL_MIRROR } from "./fittingRoomMirror";

export function FittingMirrorDisplay() {
  const theme = usePreferencesStore(s => s.theme);
  const contrast = usePreferencesStore(s => s.highContrast);
  const reducedMotion = usePreferencesStore(s => s.reducedMotion);
  const compact = useThree(s => isCompactPreview(s.size.width));
  const clock = useThree(s => s.clock);
  const accent = contrast ? "#e9f1ff" : GARAGE_LIGHT_COLORS[theme];
  const mirror = useMemo(() => createFittingRoomMirror(compact, () => (
    reducedMotion ? undefined : clock.elapsedTime
  )), [compact, clock, reducedMotion]);
  useEffect(() => () => { mirror.dispose(); mirror.geometry.dispose(); }, [mirror]);

  return <group name="fitting-room-mirror">
    <group position={FITTING_WALL_MIRROR.position} rotation={[0, FITTING_WALL_MIRROR.yaw, 0]}>
      <mesh geometry={mirror.geometry} position={[0, 0, -.06]} scale={[1.13, 1.075, 1]}>
        <meshStandardMaterial color="#202b3c" metalness={.36} roughness={.58} />
      </mesh>
      <mesh geometry={mirror.geometry} position={[0, 0, -.026]} scale={[1.052, 1.035, 1]}>
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
    </group>
    <primitive object={mirror} dispose={null} />
  </group>;
}
