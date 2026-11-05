import {mountPlateLights} from '../vehicles/tools/plateLights';
import {VehicleFlags} from '../store/input/protocol/inputMasks';
import {prepareLampLenses} from "../vehicles/tools/lampLenses";
import { useConnectionView, useMotionView, type MotionState } from "../store/session/networkViews";
import { useLayoutEffect, useRef, type RefObject } from "react";
import type { Group, Object3D } from "three";
import { snapshotEntity, useNetworkStore } from "../store/session/networkStore";
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
  const localId = useConnectionView(s => s.playerId);
  const id = entityId ?? localId;
  const lampsEnabled=useRenderSettingsStore(s=>s.vehicleLights);
  useLayoutEffect(() => {
    if(!visual.current)return;
    const release=prepareLampLenses(visual.current);
    const owned=lampsEnabled && !preview ? mountPlateLights(visual.current) : null;
    const update=(s:MotionState)=>owned?.setNight(Boolean((snapshotEntity(s.snapshot,id)?.vehicle_mask??0)&VehicleFlags.HEADLIGHTS));
    let stop:(()=>void)|undefined;
    if(owned?.count){update(useMotionView.getState());stop=useMotionView.subscribe(update);}
    return ()=>{stop?.();owned?.dispose();release();};
  }, [id,visual,wheels,model,preview,lampsEnabled]);
  const enabled = useRenderSettingsStore((s) => s.autoVehicleAlignment);
  // Stable scalar metadata prevents this hook from rerendering on every pose.
  const colliderKey = useMotionView((s) => {
    const shape = snapshotEntity(s.snapshot, id)?.collider;
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
