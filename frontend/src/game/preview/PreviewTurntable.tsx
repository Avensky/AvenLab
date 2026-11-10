import { useCallback, useRef, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { DoubleSide, Group } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";

export function PreviewTurntable({
  children,
  onReady,
  spin = true,
}: {
  children: ReactNode;
  onReady: (group: Group | null) => void;
  spin?: boolean;
}) {
  const group = useRef<Group>(null);
  const drag = useRef<{ pointerId: number; clientX: number } | null>(null);
  const attach = useCallback(
    (object: Group | null) => {
      group.current = object;
      onReady(object);
    },
    [onReady],
  );
  const reducedMotion = usePreferencesStore((s) => s.reducedMotion);
  const cameraSensitivity = usePreferencesStore((s) => s.cameraSensitivity);

  useFrame((_, delta) => {
    if (group.current && spin && !reducedMotion && !drag.current)
      group.current.rotation.y += Math.min(delta, 0.1) * 0.035;
  }, -1);

  const beginDrag = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    drag.current = { pointerId: event.pointerId, clientX: event.clientX };
    (event.target as EventTarget & { setPointerCapture(pointerId: number): void }).setPointerCapture(event.pointerId);
  };
  const continueDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.current.clientX;
    drag.current.clientX = event.clientX;
    if (group.current) group.current.rotation.y += deltaX * cameraSensitivity * 0.006;
  };
  const endDrag = (event: ThreeEvent<PointerEvent>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    const target = event.target as EventTarget & { hasPointerCapture(pointerId: number): boolean; releasePointerCapture(pointerId: number): void };
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  };

  // A transparent ground plane makes the whole preview stage a drag surface.
  // Pointer input rotates the vehicle and turntable together, never the camera.
  return (
    <group ref={attach} name="vehicle-turntable">
      {children}
      <mesh
        name="vehicle-turntable-drag-surface"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.065, 0]}
        onPointerDown={beginDrag}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <planeGeometry args={[40, 40]} />
        <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} side={DoubleSide} />
      </mesh>
    </group>
  );
}
