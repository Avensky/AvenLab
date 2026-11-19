import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, type Vector3 } from "three";
import { useFleetPoseReader } from "../hooks/usePhysicsInterpolator";
import { snapshotEntity, useNetworkStore } from "../store/session/networkStore";
import { useRenderSettingsStore } from "../store/presentation/renderSettingsStore";
import { useVisualAlignmentStore } from "../store/presentation/visualAlignmentStore";
import type { RosterEntity } from "./rosterSelector";
import { modelOffset } from "./tools/roadLamps";
import { createDriverFleet } from "./drivers/driverFleet";

// bake-vehicle-lods.py grounds the tank at this tire/track floor. The road
// profiles already carry their source floors; the tank has no road lamp profile.
const TANK_SOURCE_FLOOR = .013059604912996;
const currentAppearance = (id: string) => snapshotEntity(useNetworkStore.getState().snapshot, id)?.driver;
function currentOffset(car: RosterEntity, out: Vector3) {
  modelOffset(car, out);
  if (car.vehicle_id === "tank" && useVisualAlignmentStore.getState().reports[car.id]?.model !== "tank") out.y -= TANK_SOURCE_FLOOR;
}

/** A single update loop and shared geometry set for occupied network vehicles.
 * No profile/GLTF loader, fitting work, character mixer, or React pose updates. */
export function GameplayDrivers({ cars }: { cars: readonly RosterEntity[] }) {
  const group = useRef<Group>(null);
  const fleet = useRef<ReturnType<typeof createDriverFleet> | null>(null);
  const read = useFleetPoseReader();
  const lowDetail = useRenderSettingsStore(state => state.lowDetail);
  const sources = useMemo(() => ({ pose: read, appearance: currentAppearance, offset: currentOffset }), [read]);
  useLayoutEffect(() => {
    // Allocation and ownership start only after commit. StrictMode's effect
    // replay creates a fresh set after disposing the previous committed set.
    if (!group.current) return;
    const owned = createDriverFleet(cars, sources);
    fleet.current = owned;
    group.current.add(owned.root);
    return () => { if (fleet.current === owned) fleet.current = null; owned.dispose(); };
  }, [cars, sources]);
  useFrame(({ camera, clock, size }) => {
    fleet.current?.update(camera, size.height, clock.elapsedTime, lowDetail);
  });
  return <group name="occupied-gameplay-drivers" ref={group} dispose={null} />;
}
