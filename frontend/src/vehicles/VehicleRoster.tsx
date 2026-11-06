import {RoadHeadlights} from './RoadHeadlights';
import {NitrousExhaust} from './NitrousExhaust';
import {ExteriorMarkers} from "./ExteriorMarkers";
import { useConnectionView, useMotionView } from "../store/session/networkViews";
import { RemoteFleet, VehicleExterior } from "./RemoteFleet";
import { vehicleAsset } from "../worldBuilder/vehicles/vehicleCatalog";
import { useUIStore } from "../store/menus/uiStore";
import { useSelectionStore } from "../store/selection/selectionStore";
import {useAlphaStore} from '../store/alpha/alphaStore';
import { Suspense, memo, useMemo, useRef } from "react";
import type { Group } from "three";
import { useFrame } from "@react-three/fiber";
import { useVehiclePhysicsInterpolator } from "../hooks/usePhysicsInterpolator";
import type { ReactNode } from "react";


import { useWorldStore } from "../store/world/worldStore";
import {
  useRenderSettingsStore,
  type VisualMode,
} from "../store/presentation/renderSettingsStore";
import { ColliderVehicle } from "./ColliderVehicle";
import { AssetBoundary } from "../components/debugger/AssetBoundary";

import { createRosterSelector, type RosterEntity } from "./rosterSelector";
import { Ae86 } from "./Ae86";
import { SocketCar } from "./SocketCar";
import { Cx30 } from "./Cx30";
import { Brz } from "./Brz";
import { Camaro } from "./Camaro";
import { Supra } from "./Supra";
import { Tank } from "./Tank";
import {NavalVessel} from './NavalVessel';

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
  const color = loading ? "#334155" : team === "red" ? "#7f1d1d" : "#1e3a8a";

  return (
    <group name={`vehicle-fallback-${entity.id}`} ref={root}>
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[1.8, 0.7, 4.2]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  );
}

function NetworkVehicle({
  entity,
  mode,
}: {
  entity: RosterEntity;
  mode: VisualMode;
}) {
  if (mode === "hidden") return null;
  if (mode === "collider" || mode === "geometry") {
    return entity.collider ? (
      <ColliderVehicle
        id={entity.id}
        shape={entity.collider}
        solid={mode === "geometry"}
      />
    ) : (
      <VehicleFallback entity={entity} loading />
    );
  }
  return (
    <>
      <GlbVehicle entity={entity} />
      {mode === "hybrid" && entity.collider && (
        <ColliderVehicle id={entity.id} shape={entity.collider} />
      )}
    </>
  );
}

function GlbVehicle({ entity }: { entity: RosterEntity }) {
  const vehicleId = normalizeVehicleId(entity.vehicle_id);

  let model: ReactNode;

  switch (vehicleId) {
    case "enforcer":
    case "interceptor":
    case "charger70":
    case "skyline34":
    case "timecar":
    case "sierra":
    case "fortuner":
    case "landcruiser":
    case "mini":
      model = <SocketCar entityId={entity.id} model={vehicleId} />;
      break;

    case "cx30":
      model = <Cx30 entityId={entity.id} />;
      break;
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

    case "tank":
      model = <Tank entityId={entity.id} />;
      break;

    case "hawaii-rescue":
      model = <NavalVessel entityId={entity.id}/>;
      break;
    case "louisiana":
      model = <NavalVessel entityId={entity.id} model="louisiana"/>;
      break;

    default:
      return <VehicleFallback entity={entity} />;
  }

  const loading = <VehicleExterior entity={{...entity,vehicle_id:vehicleId}}/>;
  return <AssetBoundary fallback={loading}><Suspense fallback={loading}>{model}</Suspense></AssetBoundary>;
}

export const VehicleRoster = memo(function VehicleRoster() {
  const mode = useWorldStore((s) => s.mode);
  const overlay=useUIStore(s=>s.overlay);
  const local=useConnectionView(s => s.playerId);
  const preview=useSelectionStore(s=>s.getSelectedVehicle().id);
  const previewHero=useAlphaStore(s=>s.previewHero);
  const previewVehicle=previewHero==='hawaii-rescue'||previewHero==='louisiana'?previewHero:preview;
  const overrides = useRenderSettingsStore((s) => s.vehicleOverrides);
  const selectRoster = useMemo(createRosterSelector, []);
  const entities = useMotionView(selectRoster);
  const lampsEnabled=useRenderSettingsStore(s=>s.vehicleLights);
  const lampCars=useMemo(()=>entities.filter(e=>['glb','hybrid'].includes(overrides[e.id]??mode)),[entities,overrides,mode]);

  const driver = lampCars.find(car=>car.id===local);
  const {regular,remote}=useMemo(()=>{
    const regular:RosterEntity[]=[],remote:RosterEntity[]=[];
    for(const entity of entities){
      if(entity.id!==local && (overrides[entity.id]??mode)==='glb' && vehicleAsset(entity.vehicle_id??''))remote.push(entity);
      else regular.push(entity);
    }
    return {regular,remote};
  },[entities,local,mode,overrides]);
  return (
    <group name="network-vehicle-roster">
      {lampCars.length>0 && <><ExteriorMarkers cars={lampCars}/><NitrousExhaust cars={lampCars}/></>}
      {lampsEnabled && driver && <RoadHeadlights car={driver}/>}
      {!!remote.length && <RemoteFleet cars={remote}/>}
      {regular.map((entity) => (
        <NetworkVehicle
          key={entity.id}
          entity={overlay === "vehicle_select" && entity.id === local ? {...entity,vehicle_id:previewVehicle} : entity}
          mode={overlay === "vehicle_select" && entity.id === local ? "glb" : overrides[entity.id] ?? mode}
        />
      ))}
    </group>
  );
});

export default VehicleRoster;
