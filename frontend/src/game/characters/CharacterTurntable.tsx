import { isMirrorMakeupEmote } from "./mirrorCheck";
import { useEffect, useRef, type ReactNode } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Group, MathUtils } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { useCharacterPreviewStore } from "./characterPreviewStore";
import { useFittingTurnStore } from "./fittingControlsStore";

/** Model hit-testing owns character drag; the outer turntable continues to own vehicle/background drag. */
export function CharacterTurntable({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const group = useRef<Group>(null);
  const drag = useRef<{ id: number; x: number; travel: number; target: Element } | null>(null);
  const invalidate = useThree(s => s.invalidate);
  const connected = useThree(s => s.events.connected);
  const reduced = usePreferencesStore(s => s.reducedMotion);
  useEffect(() => useFittingTurnStore.subscribe(() => invalidate()), [invalidate]);
  useEffect(() => {
    if (!enabled || !connected) return;
    // The initial hit chose the actor. Its captured pointer can supply deltas
    // without asking Fiber to intersect every skinned mesh again on each move.
    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      const delta = event.clientX - current.x;
      current.x = event.clientX;
      current.travel += Math.abs(delta);
      useFittingTurnStore.setState(s => ({ characterYaw: s.characterYaw + delta * .008 }));
    };
    const release = (event?: PointerEvent) => {
      const current = drag.current;
      if (!current || (event && current.id !== event.pointerId)) return;
      drag.current = null;
      useFittingTurnStore.setState({ dragging: false, suppressClickUntil: current.travel > 3 ? performance.now() + 250 : 0 });
      if (current.target.hasPointerCapture(current.id)) current.target.releasePointerCapture(current.id);
    };
    connected.addEventListener("pointermove", move);
    connected.addEventListener("pointerup", release);
    connected.addEventListener("pointercancel", release);
    connected.addEventListener("lostpointercapture", release);
    return () => {
      connected.removeEventListener("pointermove", move);
      connected.removeEventListener("pointerup", release);
      connected.removeEventListener("pointercancel", release);
      connected.removeEventListener("lostpointercapture", release);
      release();
    };
  }, [enabled, connected]);
  useFrame((_, delta) => {
    if (!group.current) return;
    const yaw = enabled && !useCharacterPreviewStore.getState().insideCar && !isMirrorMakeupEmote(useCharacterPreviewStore.getState().emote?.id) ? useFittingTurnStore.getState().characterYaw : 0;
    group.current.rotation.y = reduced ? yaw : MathUtils.damp(group.current.rotation.y, yaw, 18, Math.min(delta, .1));
    if (Math.abs(group.current.rotation.y - yaw) > .001) invalidate();
  }, -.75);
  const begin = (event: ThreeEvent<PointerEvent>) => {
    const view = useCharacterPreviewStore.getState();
    if (drag.current || event.button !== 0 || event.pointerType === "touch" || view.insideCar || isMirrorMakeupEmote(view.emote?.id)) return;
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    const target = event.nativeEvent.target as Element;
    target.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, travel: 0, target };
    useFittingTurnStore.setState({ dragging: true });
  };
  return <group ref={group} name="fitting-character-pivot" onPointerDown={enabled ? begin : undefined}>
    {children}
  </group>;
}
