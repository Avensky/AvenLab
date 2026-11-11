import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { GARAGE_LIGHT_COLORS } from "../../theme/garageLighting";
import { isCompactPreview } from "../preview/previewBudget";
import { chamferedPanel, createFittingRoomMirror, FITTING_WALL_MIRROR } from "./fittingRoomMirror";

/** A small studio and one planar pass of the live scene. The model keeps its existing rig and pose. */
export function FittingRoomStage() {
  const theme = usePreferencesStore(s => s.theme);
  const contrast = usePreferencesStore(s => s.highContrast);
  const reducedMotion = usePreferencesStore(s => s.reducedMotion);
  const compact = useThree(s => isCompactPreview(s.size.width));
  const clock = useThree(s => s.clock);
  const accent = contrast ? "#e9f1ff" : GARAGE_LIGHT_COLORS[theme];
  const mirror = useMemo(() => createFittingRoomMirror(compact, () => (
    reducedMotion ? undefined : clock.elapsedTime
  )), [compact, clock, reducedMotion]);
  const platform = useMemo(() => chamferedPanel(2.44, 2.02, .18), []);
  useEffect(() => () => { mirror.dispose(); mirror.geometry.dispose(); }, [mirror]);
  useEffect(() => () => platform.dispose(), [platform]);

  return <>
    <color attach="background" args={["#0c1420"]} />
    <fog attach="fog" args={["#0c1420", 8, 22]} />
    <group name="fitting-room-studio">
      <hemisphereLight args={["#e6edff", "#3b3e51", .85]} />
      <directionalLight name="fitting-key" position={[-2.8, 4.3, 4.8]} color="#fff3e7" intensity={2.05} />
      <directionalLight name="fitting-fill" position={[3.8, 2.2, 3.5]} color="#dae5ff" intensity={.85} />
      <directionalLight name="fitting-rim" position={[1.6, 3.6, -3.2]} color="#eef4ff" intensity={1.65} />
      <mesh name="fitting-room-floor" rotation={[-Math.PI / 2, 0, 0]} position={[0, -.012, 0]}>
        <planeGeometry args={[36, 36]} />
        <meshStandardMaterial color="#141f2d" roughness={.94} />
      </mesh>
      <group position={[0, .001, .18]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh geometry={platform} scale={[1.022, 1.024, 1]}>
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
        <mesh geometry={platform} position={[0, 0, .002]}>
          <meshStandardMaterial color="#202c3d" roughness={.88} />
        </mesh>
      </group>
      <mesh name="fitting-room-back-wall" position={[0, 1.72, -1.88]}>
        <planeGeometry args={[7, 3.46]} />
        <meshStandardMaterial color="#121d2b" roughness={.96} />
      </mesh>
      <mesh position={[-1.47, 1.43, -1.875]}>
        <planeGeometry args={[.025, 2.36]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <group position={FITTING_WALL_MIRROR.position} rotation={[0, FITTING_WALL_MIRROR.yaw, 0]}>
        <mesh geometry={mirror.geometry} position={[0, 0, -.06]} scale={[1.13, 1.075, 1]}>
          <meshStandardMaterial color="#202b3c" metalness={.36} roughness={.58} />
        </mesh>
        <mesh geometry={mirror.geometry} position={[0, 0, -.026]} scale={[1.052, 1.035, 1]}>
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
      </group>
      <primitive object={mirror} dispose={null} />
    </group>
  </>;
}
