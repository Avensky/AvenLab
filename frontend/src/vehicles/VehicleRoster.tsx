import { Suspense, memo, useMemo, useRef } from "react";
import type { Group } from "three";
import { useFrame } from "@react-three/fiber";
import { useVehiclePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import type { ReactNode } from "react";

import { useNetworkStore } from "../store/networkStore";

// Only roster metadata belongs in React; positions are sampled per frame.
type RosterEntity = { id: string; vehicle_id?: string | null; team?: string };
import { Ae86 } from "./Ae86";
import { Brz } from "./Brz";
import { Camaro } from "./Camaro";
import { Supra } from "./Supra";

function normalizeVehicleId(vehicleId?: string | null) {
  return vehicleId?.trim().toLowerCase().replaceAll("_", "-") ?? "";
}

function VehicleFallback({
  entity,
  loading = false,
}: {
  entity: RosterEntity;
  loading?: boolean;
}) {
  const root = useRef<Group | null>(null);
  const { getInterpolated } = useVehiclePhysicsInterpolator(entity.id);
  useFrame(() => {
    const pose = getInterpolated(entity.id);
    if (!root.current || !pose) return;
    root.current.position.fromArray(pose.position);
    root.current.quaternion.fromArray(pose.rotation);
  });
  const team = String(entity.team ?? "").toLowerCase();
  const color = loading
    ? "#334155"
    : team === "red"
      ? "#7f1d1d"
      : "#1e3a8a";

  return (
    <group
      name={`vehicle-fallback-${entity.id}`}
      ref={root}
    >
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[1.8, 0.7, 4.2]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  );
}

function NetworkVehicle({ entity }: { entity: RosterEntity }) {
  const vehicleId = normalizeVehicleId(entity.vehicle_id);

  let model: ReactNode;

  switch (vehicleId) {
    case "ae86":
    case "toyota-ae86":
      model = <Ae86 entityId={entity.id} />;
      break;

    case "brz":
    case "subaru-brz":
    case "frs":
    case "fr-s":
    case "scion-frs":
    case "scion-fr-s":
    case "gt86":
    case "toyota-gt86":
      model = <Brz entityId={entity.id} />;
      break;

    case "camaro":
    case "camaro-2017":
      model = <Camaro entityId={entity.id} />;
      break;

    case "supra":
    case "supra-2020":
    case "gr-supra":
    case "toyota-supra":
    case "a90":
    case "toyota-a90":
      model = <Supra entityId={entity.id} />;
      break;

    default:
      return <VehicleFallback entity={entity} />;
  }

  return (
    <Suspense fallback={<VehicleFallback entity={entity} loading />}>
      {model}
    </Suspense>
  );
}

export const VehicleRoster = memo(function VehicleRoster() {
  // A stable scalar selector avoids rerendering all loaded GLBs on every
  // snapshot/debug packet. Joins, model changes and team changes still update.
  const rosterKey = useNetworkStore((state) => JSON.stringify(
    (state.snapshot?.entities ?? []).map((entity) => ({
      id: entity.id, vehicle_id: entity.vehicle_id, team: entity.team,
    })),
  ));
  const entities = useMemo(() => JSON.parse(rosterKey) as RosterEntity[], [rosterKey]);

  return (
    <group name="network-vehicle-roster">
      {entities.map((entity) => (
        <NetworkVehicle key={entity.id} entity={entity} />
      ))}
    </group>
  );
});

export default VehicleRoster;
