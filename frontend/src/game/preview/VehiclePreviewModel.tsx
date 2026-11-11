import { nearestSideMirror, type MirrorCheckFit } from "../characters/mirrorCheck";
import { FACTORY_APPEARANCE, useHeroLoadouts } from "../../vehicles/cosmetics/heroLoadouts";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { prepareVehicleVisual } from "../../vehicles/tools/vehicleMaterials";
import {
  VEHICLE_MODEL_PATHS,
  type VehicleModelId,
} from "../../vehicles/tools/vehicleModelPaths";
import { fitPreviewToPlatform, measureDriverLean, measurePreviewBounds } from "./previewPlacement";
import { PreviewContactShadow } from "./PreviewContactShadow";
import { applyShowroomHighlights, applyShowroomPaint } from "./garageVehiclePaint";
import { prepareGarageVehiclePaint } from "./garageVehiclePaint";
import {createVehiclePartRig,advanceVehiclePartRig,availableVehicleParts,measureDriverDoor} from "./vehiclePartRig";
import {useVehicleStudioStore} from "../heroes/vehicleStudioStore";
import {Mesh,MeshStandardMaterial,Vector3,type Color,type Group,type Object3D} from "three";
import { GarageDriver } from "../characters/GarageDriver";
import { ROOK_ID, type CharacterChoice } from "../characters/characterCatalog";
import {useFrame} from "@react-three/fiber";
import {applyWindowTone} from "./windowTones";
import {vehicleSystems} from "../../vehicles/vehicleSystems";
import { prepareGarageCockpit, type GarageCockpit } from "./garageCockpit";
import { GARAGE_STATIONS, garageStationCamera } from "./garageStations";
import { usePreviewPaint } from "./usePreviewPaint";
import { splitAe86DriverDoor } from "./ae86DriverDoor";
import { splitGarageSteering } from "./splitGarageSteering";
import { splitTimecarDriverDoor } from "./timecarDriverDoor";
import { garageCamera, useGarageDrive } from "./garageDriveStore";
import { useCharacterPreviewStore } from "../characters/characterPreviewStore";
import { prepareGarageDashboard } from "./garageDashboard";
import { GarageVehicleDiagnosticsScene } from "./GarageVehicleDiagnosticsScene";
import { garageMounts, useGarageDiagnostics } from "./garageDiagnosticsStore";
import { prepareGarageHeadlightGlass } from "./garageHeadlightGlass";

type VehicleLayout = {
  model: VehicleModelId;
  measurements: ReturnType<typeof measurePreviewBounds>;
  door: ReturnType<typeof measureDriverDoor>;
};
// Exact bounds and ray tests depend on the imported geometry, not the paint or
// the current platform scale. Let the GLTF cache own their lifetime.
const layouts = new WeakMap<Object3D, VehicleLayout>();
const leanFits = new WeakMap<VehicleLayout, { fit: ReturnType<typeof measureDriverLean> }>();

function setLampEmission(material: MeshStandardMaterial, color: number | Color, intensity: number) {
  material.emissive.set(color);
  material.emissiveIntensity = intensity;
}

// Selection is always the complete GLB, independent of in-game debug modes.
// Shared material preparation retains the TSX fixes without runtime network poses.
export function VehiclePreviewModel({platform,model,driver,previewPacks,onSettled,allowDriver = true,garageOpen = false}:{
  platform: readonly [number, number];
  model: VehicleModelId;
  driver?: CharacterChoice | null;
  previewPacks?: boolean;
  onSettled?: (model: VehicleModelId) => void;
  allowDriver?: boolean;
  garageOpen?: boolean;
}) {
  const path=VEHICLE_MODEL_PATHS[model];
  const station = GARAGE_STATIONS[model];
  const motion = useRef<Group>(null);
  const savedAppearance = useHeroLoadouts(s => s.draft?.vehicle === model ? s.draft.appearance : s.loadouts[model]);
  const { scene } = useGLTF(path, "/draco/");
  const driverReady = usePreviewPaint(Boolean(driver && allowDriver));
  const prepared = useMemo(
    () => {
      const visual = prepareVehicleVisual(scene, model);
      const releaseDoor = model === "ae86" ? splitAe86DriverDoor(visual.root) : undefined;
      const releaseSteering = splitGarageSteering(visual.root, model);
      const gullwing = model === "timecar" ? splitTimecarDriverDoor(visual.root) : undefined;
      prepareGarageVehiclePaint(visual.root, model);
      const dashboard = prepareGarageDashboard(visual.root, GARAGE_STATIONS[model]);
      const headlightGlass = prepareGarageHeadlightGlass(visual.root, garageMounts(model, "headlights"));
      return { ...visual, gullwing, dashboard, headlightGlass, dispose: () => {
        headlightGlass.dispose(); dashboard?.dispose(); gullwing?.dispose(); releaseSteering?.(); releaseDoor?.(); visual.dispose();
      } };
    },
    [scene, model],
  );
  const vehiclePainted = usePreviewPaint();
  useLayoutEffect(() => {
    if (vehiclePainted) onSettled?.(model);
  }, [vehiclePainted, model, onSettled]);
  const partRig=useMemo(() => {
    const parts = createVehiclePartRig(prepared.root, model);
    if (prepared.gullwing) parts.push(prepared.gullwing.hinge);
    return parts;
  }, [prepared, model]);
  const driverDoor = station.kind === "wheel" ? partRig.find(part => part.part === (station.rim[0] < 0 ? "door-right" : "door-left")) : undefined;
  const popup = partRig.find(part => part.part === "headlights");
  const cockpitSetup = useRef<{ source: Object3D; prepare: ReturnType<typeof prepareGarageCockpit> }>(null);
  const playCockpit = useCallback<GarageCockpit>(driverRoot => {
    const motionGroup = motion.current;
    if (!motionGroup) return null;
    if (cockpitSetup.current?.source !== prepared.root) {
      cockpitSetup.current = { source: prepared.root, prepare: prepareGarageCockpit(prepared.root, prepared.glassMaterials, driverDoor, station) };
    }
    return cockpitSetup.current.prepare?.(driverRoot, motionGroup) ?? null;
  }, [prepared, driverDoor, station]);
  const cockpit = previewPacks || garageOpen ? playCockpit : undefined;
  const marine=vehicleSystems(model)==="marine";
  const inspectBody=useVehicleStudioStore(s=>s.activeTab==="body"||s.parts["door-left"]||s.parts["door-right"]);
  const glassStyle=useVehicleStudioStore(s=>s.glassStyle);
  const lensStyle=useGarageDiagnostics(s=>s.tests[model]?.lens??"factory");
  const lamps=useMemo(()=>{
    const navigation=new Set<MeshStandardMaterial>(),searchlights=new Set<MeshStandardMaterial>();
    if (marine) prepared.root.traverse(object=>{
      if(!(object instanceof Mesh))return;
      const objectName=object.name;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(const value of materials){
        if(!(value instanceof MeshStandardMaterial))continue;
        const name=`${objectName} ${value.name}`.toLowerCase();
        if (/running_lights|stern_light/.test(name)) navigation.add(value);
        if (/searchligh/.test(name)) searchlights.add(value);
      }
    });
    const all=new Set([...navigation,...searchlights]);
    return {navigation,all,originals:new Map([...all].map(material=>[material,{emissive:material.emissive.clone(),intensity:material.emissiveIntensity}] as const))};
  },[prepared,marine]);
  const lastLampStyle=useRef("");
  useEffect(() => () => prepared.dispose(), [prepared]);
  useEffect(()=>{lastLampStyle.current="";},[lamps]);
  useEffect(()=>{
    useVehicleStudioStore.getState().reset();
    useVehicleStudioStore.getState().setAvailable(model,[...availableVehicleParts(partRig)]);
    useGarageDrive.setState({ hasDoor: Boolean(driverDoor) });
    return ()=>{if(useVehicleStudioStore.getState().availableVehicle===model)useVehicleStudioStore.getState().setAvailable(null);};
  },[model,partRig,driverDoor]);
  useEffect(()=>{
    if (!marine) applyWindowTone(prepared.glassMaterials, glassStyle);
  },[prepared,glassStyle,marine]);
  useEffect(() => {
    if (!garageOpen) return;
    useGarageDiagnostics.getState().setLensCount(model, prepared.headlightGlass.count);
    return () => {
      if (useGarageDiagnostics.getState().lensVehicle === model) useGarageDiagnostics.getState().setLensCount(null, 0);
    };
  }, [garageOpen, model, prepared]);
  useEffect(() => {
    prepared.headlightGlass.apply(garageOpen ? lensStyle : "factory");
  }, [prepared, garageOpen, lensStyle]);
  useEffect(() => {
    const appearance = savedAppearance ?? FACTORY_APPEARANCE;
    applyShowroomPaint(prepared.root, model, "factory", appearance.body === "factory" ? undefined : appearance.body);
    applyShowroomHighlights(prepared.root, .45, appearance.finish, appearance.metallic, model);
  }, [prepared, model, savedAppearance]);
  useFrame((_,delta)=>{
    const studio=useVehicleStudioStore.getState();
    const drive = useGarageDrive.getState();
    const stage = drive.stage;
    prepared.dashboard?.setActive(Boolean((garageOpen && (stage !== "idle" || garageCamera(drive) === "Dashboard")) ||
      (previewPacks && useCharacterPreviewStore.getState().insideCar)));
    prepared.dashboard?.update();
    const drivenDoor = driverDoor && ((garageOpen && stage !== "idle" && stage !== "station") ||
      (previewPacks && useCharacterPreviewStore.getState().insideCar)) ? driverDoor.part : undefined;
    const garageLights = garageOpen ? useGarageDiagnostics.getState().tests[model]?.lights : undefined;
    advanceVehiclePartRig(partRig,studio.parts,delta,drivenDoor,studio.parts.headlights || Boolean(garageLights && garageLights !== "off"));
    if (marine) {
      const {navigation,searchlights}=studio.marineLights;
      const key=`${navigation}:${searchlights}`;
      if(lastLampStyle.current===key)return;
      lastLampStyle.current=key;
      for(const material of lamps.all){
        const active = lamps.navigation.has(material) ? navigation : searchlights;
        const original = lamps.originals.get(material)!;
        setLampEmission(material, active ? 0xffecd4 : original.emissive, active ? .9 : original.intensity);
      }
    }
  });
  // Keep the original measurements when the garage finishes loading; re-reading
  // a mounted model would measure its already-scaled parent a second time.
  const layout = useMemo(() => {
    const cached = layouts.get(scene);
    if (cached?.model === model) return cached;
    const result: VehicleLayout = {
      model,
      measurements: measurePreviewBounds(prepared.root, model),
      door: vehicleSystems(model) === "road" ? measureDriverDoor(prepared.root, model) : null,
    };
    layouts.set(scene, result);
    return result;
  }, [scene, prepared, model]);
  const { measurements, door: doorBounds } = layout;
  const display = useMemo(
    () => fitPreviewToPlatform(measurements, platform),
    [measurements, platform],
  );
  const driverScale = marine ? 1.35 : display.scale;
  const hasDriver = Boolean(driver);
  const rook = driver?.id === ROOK_ID;
  const staging = useMemo(() => {
    const vehicleCenter = measurements.centering.getCenter(new Vector3());
    const doorCenter = doorBounds?.getCenter(new Vector3());
    const side = station.kind === "wheel" ? Math.sign(station.rim[0]) : doorCenter && doorCenter.x > vehicleCenter.x ? 1 : -1;
    const edge = side < 0
      ? Math.min(doorBounds?.min.x ?? Infinity, measurements.bounds.min.x)
      : Math.max(doorBounds?.max.x ?? -Infinity, measurements.bounds.max.x);
    const along = station.kind === "wheel" ? station.seat[2] : doorCenter?.z;
    if (hasDriver && driverReady && along !== undefined && Number.isFinite(edge) && !leanFits.has(layout)) {
      const fit = measureDriverLean(prepared.root, edge + side * .27, measurements.support.min.y, along, side);
      leanFits.set(layout, { fit });
    }
    const fit = driverReady ? leanFits.get(layout)?.fit : undefined;
    return { side, edge, along, fit };
  }, [doorBounds, measurements, prepared, hasDriver, driverReady, layout, station]);
  const inset = inspectBody ? 0 : Math.min(staging.fit?.offset ?? 0, rook ? .14 : .06);
  const lean = useMemo(() => {
    const fit = staging.fit;
    return !rook || inspectBody || !previewPacks || driver?.prop || !fit ? undefined : { ...fit, offset: fit.offset - inset };
  }, [staging.fit, rook, inspectBody, previewPacks, driver?.prop, inset]);
  const driverAcross = staging.edge * display.scale + display.position[0] + staging.side * (.27 - inset) * driverScale;
  // Vehicles without an authored front door still stage beside the front seat.
  const driverAlong = staging.along === undefined ? display.footprint[1] * .12 : staging.along * display.scale + display.position[2];
  const mirrorFit = useMemo<MirrorCheckFit | undefined>(() => {
    if (!previewPacks || !driverReady || station.kind !== "wheel" || staging.along === undefined) return undefined;
    const from = new Vector3(staging.edge + staging.side * (.27 - inset), measurements.support.min.y, staging.along);
    const mirror = nearestSideMirror(prepared.root, station, measurements.bounds, from);
    if (!mirror) return undefined;
    const across = -staging.side * (mirror.z - from.z);
    if (Math.abs(across) > 1.4) return undefined;
    return { across, forward: .12, side: staging.side, gaze: Math.max(.15, Math.min(.65, Math.atan2(1.48 - (mirror.y - from.y), .5))) };
  }, [previewPacks, driverReady, station, staging, inset, measurements, prepared]);
  const cameraRig = useMemo(() => {
    const size = measurements.bounds.getSize(new Vector3());
    const center = measurements.bounds.getCenter(new Vector3());
    const door = doorBounds?.getCenter(new Vector3()) ?? center;
    const side = staging.side;
    const doorZ = staging.along ?? door.z;
    const height = Math.max(1.3, size.y);
    const width = Math.max(1.65, size.x);
    const length = Math.max(3.2, size.z);
    const shots = [
      { name: "High Angle", at: [center.x, center.y, center.z], eye: [width * .8, length * .93, length * .52] },
      { name: "Driver Door", at: [door.x, Math.min(door.y, measurements.bounds.min.y + size.y * .48), doorZ], eye: [side * width * 1.18, height * .32, -length * .38] },
      { name: "Chase", at: [center.x, center.y, center.z + length * .15], eye: [-width * .57, height * 1.28, -length * 1.14] },
    ];
    const cockpitShot = garageStationCamera(station);
    shots.push({ name: "Cockpit", at: [...cockpitShot.at], eye: [...cockpitShot.eye] });
    if (station.kind === "wheel") {
      const [x, y, z] = station.rim;
      // Look over the rim into the instrument recess. Keep the eye behind the
      // dashboard overhang so the camera cannot enter its solid top surface.
      const eyeY = Math.min(station.roof - .10, y + .22);
      shots.push(model === "timecar"
        ? { name: "Dashboard", at: [x, y + .085, z + .195], eye: [0, .015, -.12] }
        : { name: "Dashboard", at: [x, y + .09, z + .20], eye: [0, eyeY - y - .09, -.32] });
    }
    return shots;
  }, [doorBounds, measurements, staging.side, staging.along, station, model]);
  return (
    <group ref={motion}>
      {driver && <group position={[driverAcross, .023, driverAlong]} scale={driverScale} rotation={[0, staging.side * Math.PI / 2, 0]}>
        {driverReady ? <>
          <group name="garage-driver-shadow"><PreviewContactShadow footprint={[.55, .46]} offset={[0, 0]} /></group>
          <GarageDriver choice={driver} previewPacks={previewPacks} leanFit={lean} mirrorFit={mirrorFit} cockpit={cockpit} />
        </> : null}
      </group>}
      <PreviewContactShadow
        footprint={display.footprint}
        offset={display.shadowOffset}
      />
      <group
        position={display.position}
        scale={display.scale}
        name="selection-vehicle-glb"
      >
        <primitive object={prepared.root} dispose={null} />
        {garageOpen && vehicleSystems(model) === "road" && <GarageVehicleDiagnosticsScene vehicle={model} popup={popup} />}
        {garageOpen && cameraRig.map(shot => <group key={shot.name} name={`garage-view-${shot.name}`}
          position={shot.at as [number, number, number]}>
          <object3D position={shot.eye as [number, number, number]} />
        </group>)}
      </group>
    </group>
  );
}
