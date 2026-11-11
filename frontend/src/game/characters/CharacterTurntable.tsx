import { MIRROR_CHECK_ID } from "./mirrorCheck";
import { useEffect, useRef, type ReactNode } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Group, MathUtils } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { useCharacterPreviewStore } from "./characterPreviewStore";
import { useFittingTurnStore } from "./fittingControlsStore";

/** Model hit-testing owns character drag; the outer turntable continues to own vehicle/background drag. */
export function CharacterTurntable({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const group = useRef<Group>(null), drag = useRef<{ id: number; x: number; travel: number } | null>(null);
  const invalidate = useThree(s => s.invalidate);
  const reduced = usePreferencesStore(s => s.reducedMotion);
  useEffect(() => useFittingTurnStore.subscribe(() => invalidate()), [invalidate]);
  useEffect(() => () => { if (drag.current) useFittingTurnStore.setState({ dragging: false }); }, []);
  useFrame((_, delta) => {
    if (!group.current) return;
    const yaw = enabled && !useCharacterPreviewStore.getState().insideCar && useCharacterPreviewStore.getState().emote?.id !== MIRROR_CHECK_ID ? useFittingTurnStore.getState().characterYaw : 0;
    group.current.rotation.y = reduced ? yaw : MathUtils.damp(group.current.rotation.y, yaw, 18, Math.min(delta, .1));
    if (Math.abs(group.current.rotation.y - yaw) > .001) invalidate();
  }, -.75);
  const end = (event: ThreeEvent<PointerEvent>) => {
    if (drag.current?.id !== event.pointerId) return;
    event.stopPropagation();
    const moved = drag.current.travel > 3; drag.current = null;
    useFittingTurnStore.setState({ dragging: false, suppressClickUntil: moved ? performance.now() + 250 : 0 });
    const target = event.target as Element;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  };
  return <group ref={group} name="fitting-character-pivot" onPointerDown={event => {
    if (!enabled || event.button !== 0 || event.pointerType === "touch" || useCharacterPreviewStore.getState().insideCar || useCharacterPreviewStore.getState().emote?.id === MIRROR_CHECK_ID) return;
    event.stopPropagation(); event.nativeEvent.stopImmediatePropagation();
    drag.current = { id: event.pointerId, x: event.clientX, travel: 0 };
    useFittingTurnStore.setState({ dragging: true });
    (event.target as Element).setPointerCapture(event.pointerId);
  }} onPointerMove={event => {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    event.stopPropagation();
    const delta = event.clientX - drag.current.x; drag.current.x = event.clientX; drag.current.travel += Math.abs(delta);
    useFittingTurnStore.setState(s => ({ characterYaw: s.characterYaw + delta * .008 }));
  }} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
    {children}
  </group>;
}
