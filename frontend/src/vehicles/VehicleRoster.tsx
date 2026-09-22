import { Suspense } from "react";
import type { ReactNode } from "react";

import { useNetworkStore } from "../store";
import type { PhysicsEntitySnapshot } from "../store/networkStore";
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
  entity: PhysicsEntitySnapshot;
  loading?: boolean;
}) {
  const team = String(entity.team ?? "").toLowerCase();
  const color = loading
    ? "#334155"
    : team === "red"
      ? "#7f1d1d"
      : "#1e3a8a";

  return (
    <group
      name={`vehicle-fallback-${entity.id}`}
      position={entity.position}
      quaternion={entity.rotation}
    >
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[1.8, 0.7, 4.2]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  );
}

function NetworkVehicle({ entity }: { entity: PhysicsEntitySnapshot }) {
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

export function VehicleRoster() {
  const entities = useNetworkStore((state) => state.snapshot?.entities ?? []);

  return (
    <group name="network-vehicle-roster">
      {entities.map((entity) => (
        <NetworkVehicle key={entity.id} entity={entity} />
      ))}
    </group>
  );
}

export default VehicleRoster;
