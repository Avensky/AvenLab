import { useEffect, useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useFittingTurnStore } from "./fittingControlsStore";

/** The camera-facing surface is behind the model, so a direct hit still turns the character. */
export function FittingCameraOrbit({ onDrag }: { onDrag: (x: number, y: number) => void }) {
  const drag = useRef<{ pointerId: number; x: number; y: number; travel: number } | null>(null);
  const connected = useThree(state => state.events.connected);

  useEffect(() => {
    if (!connected) return;
    // Fiber clears its own capture on these events without dispatching to the mesh.
    const cancel = (event: Event) => {
      if (drag.current?.pointerId === (event as PointerEvent).pointerId) drag.current = null;
    };
    connected.addEventListener("pointercancel", cancel);
    connected.addEventListener("lostpointercapture", cancel);
    return () => {
      connected.removeEventListener("pointercancel", cancel);
      connected.removeEventListener("lostpointercapture", cancel);
    };
  }, [connected]);

  function end(event: ThreeEvent<PointerEvent>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    if (drag.current.travel > 3) useFittingTurnStore.setState({ suppressClickUntil: performance.now() + 250 });
    drag.current = null;
    const target = event.target as Element;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  }

  return <mesh name="fitting-camera-drag-surface" position={[0, 0, -12]}
    onPointerDown={event => {
      if (event.button !== 0 || drag.current || useFittingTurnStore.getState().dragging) return;
      event.stopPropagation();
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, travel: 0 };
      (event.target as Element).setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const pointer = drag.current;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      const x = event.clientX - pointer.x, y = event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.travel += Math.hypot(x, y);
      if (pointer.travel > 3) onDrag(x, y);
    }}
    onPointerUp={end}>
    <planeGeometry args={[200, 200]} />
    <meshBasicMaterial visible={false} />
  </mesh>;
}
