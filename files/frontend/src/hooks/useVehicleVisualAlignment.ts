import { useLayoutEffect, useRef, type RefObject } from "react";
import type { Group, Object3D } from "three";
import { useNetworkStore } from "../store/session/networkStore";
import { useRenderSettingsStore } from "../store/presentation/renderSettingsStore";
import { useVisualAlignmentStore } from "../store/presentation/visualAlignmentStore";
import {
  measureVisualReference,
  solveVisualAlignment,
  type VisualReference,
} from "../vehicles/tools/visualAlignment";

export function useVehicleVisualAlignment(
  model: string,
  entityId: string | undefined,
  visual: RefObject<Group | null>,
  wheels: readonly (Object3D | null)[],
  preview = false,
) {
  const localId = useNetworkStore((s) => s.playerId);
  const id = entityId ?? localId;
  const enabled = useRenderSettingsStore((s) => s.autoVehicleAlignment);
  // Stable scalar metadata prevents this hook from rerendering on every pose.
  const colliderKey = useNetworkStore((s) => {
    const shape = s.snapshot?.entities.find((e) => e.id === id)?.collider;
    return shape
      ? JSON.stringify([shape.chassis_offset, shape.nominal_wheel_center_y])
      : "";
  });
  const reference = useRef<VisualReference | null>(null);
  useLayoutEffect(() => {
    const root = visual.current;
    if (!root || !root.parent || preview) return;
    // Capture even if an older server lacks metadata. Later frames must never
    // turn dynamic suspension travel into a fresh visual-height calibration.
    if (reference.current === null)
      reference.current = measureVisualReference(root.parent, root, wheels);
    const shape = useNetworkStore
      .getState()
      .snapshot?.entities.find((e) => e.id === id)?.collider;
    const result = solveVisualAlignment(reference.current, shape, enabled);
    root.position.fromArray(result.offset);
    useVisualAlignmentStore.getState().record(id, { ...result, model });
  }, [model, id, visual, wheels, preview, colliderKey, enabled]);
  useLayoutEffect(
    () => () => {
      useVisualAlignmentStore.getState().remove(id);
    },
    [id],
  );
}
