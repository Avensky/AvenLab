import { useCallback, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";
import { usePreferencesStore } from "../../store/preferencesStore";

export function PreviewTurntable({ children, onReady }: { children: ReactNode; onReady: (group: Group | null) => void }) {
  const group = useRef<Group>(null);
  const attach = useCallback((object: Group | null) => { group.current = object; onReady(object); }, [onReady]);
  const reducedMotion = usePreferencesStore(s => s.reducedMotion);
  useFrame((_, delta) => {
    if (group.current && !reducedMotion) group.current.rotation.y += Math.min(delta, 0.1) * 0.075;
  });
  // The garage's authored floor pad is portaled into this pivot when loaded.
  // Keep it mounted across model changes so its angle never jumps.
  return <group ref={attach} name="vehicle-turntable">{children}</group>;
}
