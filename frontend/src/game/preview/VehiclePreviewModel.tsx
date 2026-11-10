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
import {useInputStore} from "../../store/input/inputStore";
import {VehicleFlags,hasFlag} from "../../store/input/protocol/inputMasks";
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
import { useGarageDrive } from "./garageDriveStore";

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
      prepareGarageVehiclePaint(visual.root, model);
      return { ...visual, dispose: () => { releaseDoor?.(); visual.dispose(); } };
    },
    [scene, model],
  );
  useLayoutEffect(() => onSettled?.(model), [model, onSettled]);
  const partRig=useMemo(()=>createVehiclePartRig(prepared.root,model),[prepared,model]);
  const ae86Door = model === "ae86" ? partRig.find(part => part.part === "door-right") : undefined;
  const cockpitSetup = useRef<{ source: Object3D; prepare: ReturnType<typeof prepareGarageCockpit> }>(null);
  const playCockpit = useCallback<GarageCockpit>(driverRoot => {
    const motionGroup = motion.current;
    if (!motionGroup) return null;
    if (cockpitSetup.current?.source !== prepared.root) {
      cockpitSetup.current = { source: prepared.root, prepare: prepareGarageCockpit(prepared.root, prepared.glassMaterials, ae86Door, station) };
    }
    return cockpitSetup.current.prepare?.(driverRoot, motionGroup) ?? null;
  }, [prepared, ae86Door, station]);
  const cockpit = previewPacks || garageOpen ? playCockpit : undefined;
  const marine=vehicleSystems(model)==="marine";
  const inspectBody=useVehicleStudioStore(s=>s.activeTab==="body"||s.parts["door-left"]||s.parts["door-right"]);
  const glassStyle=useVehicleStudioStore(s=>s.glassStyle);
  const lamps=useMemo(()=>{
    const headlights=new Set<MeshStandardMaterial>(),signals=new Set<MeshStandardMaterial>(),leftSignals=new Set<MeshStandardMaterial>(),rightSignals=new Set<MeshStandardMaterial>();
    const navigation=new Set<MeshStandardMaterial>(),searchlights=new Set<MeshStandardMaterial>();
    prepared.root.traverse(object=>{
      if(!(object instanceof Mesh))return;
      const objectName=object.name;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(const value of materials){
        if(!(value instanceof MeshStandardMaterial))continue;
        const name=`${objectName} ${value.name}`.toLowerCase();
        if (marine) {
          if (/running_lights|stern_light/.test(name)) navigation.add(value);
          if (/searchligh/.test(name)) searchlights.add(value);
          continue;
        }
        if(/head.?light|headlamp|front.?light/.test(name))headlights.add(value);
        if(/indicator|turn.?signal|blinker|amber|ambar|orange|oarnge|tail.?lens|tail.?light|reflector|vehiclelights|lights\./.test(name)){
          signals.add(value);
          if(/left|(?:^|[_ .-])l(?:[_ .-]|$)|_fl|_rl/.test(name))leftSignals.add(value);
          if(/right|(?:^|[_ .-])r(?:[_ .-]|$)|_fr|_rr/.test(name))rightSignals.add(value);
        }
      }
    });
    const all=new Set([...headlights,...signals,...navigation,...searchlights]);
    return {headlights,signals,leftSignals,rightSignals,navigation,searchlights,all,originals:new Map([...all].map(material=>[material,{emissive:material.emissive.clone(),intensity:material.emissiveIntensity}] as const))};
  },[prepared,marine]);
  const lastLampStyle=useRef("");
  useEffect(() => () => prepared.dispose(), [prepared]);
  useEffect(()=>{lastLampStyle.current="";},[lamps]);
  useEffect(()=>{
    useVehicleStudioStore.getState().reset();
    useVehicleStudioStore.getState().setAvailable(model,[...availableVehicleParts(partRig)]);
    return ()=>{if(useVehicleStudioStore.getState().availableVehicle===model)useVehicleStudioStore.getState().setAvailable(null);};
  },[model,partRig]);
  useEffect(()=>{
    if (!marine) applyWindowTone(prepared.glassMaterials, glassStyle);
  },[prepared,glassStyle,marine]);
  useEffect(() => {
    const appearance = savedAppearance ?? FACTORY_APPEARANCE;
    applyShowroomPaint(prepared.root, model, "factory", appearance.body === "factory" ? undefined : appearance.body);
    applyShowroomHighlights(prepared.root, .45, appearance.finish, appearance.metallic, model);
  }, [prepared, model, savedAppearance]);
  useFrame((state,delta)=>{
    const studio=useVehicleStudioStore.getState();
    const stage = useGarageDrive.getState().stage;
    const drivenDoor = garageOpen && ae86Door && stage !== "idle" && stage !== "station" ? ae86Door.part : undefined;
    advanceVehiclePartRig(partRig,studio.parts,delta,drivenDoor);
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
      return;
    }
    const flags=useInputStore.getState().input.vehicleMask;
    const headlight=hasFlag(flags,VehicleFlags.HEADLIGHTS);
    const hazards=hasFlag(flags,VehicleFlags.HAZARDS),left=hasFlag(flags,VehicleFlags.BLINKER_LEFT),right=hasFlag(flags,VehicleFlags.BLINKER_RIGHT);
    const signal=hazards||left||right,blinkOn=signal&&Math.floor(state.clock.elapsedTime*2)%2===0;
    const signalTargets=hazards||left&&right?null:left&&lamps.leftSignals.size?lamps.leftSignals:right&&lamps.rightSignals.size?lamps.rightSignals:lamps.signals;
    const key=`${headlight}:${hazards}:${left}:${right}:${blinkOn}`;
    if(lastLampStyle.current===key)return;
    lastLampStyle.current=key;
    for(const material of lamps.all){
      const original=lamps.originals.get(material)!;
      const isSignal=lamps.signals.has(material)&&(signalTargets===null||signalTargets.has(material));
      const activeSignal=isSignal&&blinkOn;
      const activeHeadlight=lamps.headlights.has(material)&&headlight&&!isSignal;
      if(activeSignal) setLampEmission(material, 0xff8a16, 1.75);
      else if(activeHeadlight) setLampEmission(material, 0xffedbc, 1.35);
      else setLampEmission(material, original.emissive, original.intensity);
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
  const { measurements, door: driverDoor } = layout;
  const display = useMemo(
    () => fitPreviewToPlatform(measurements, platform),
    [measurements, platform],
  );
  const driverScale = marine ? 1.35 : display.scale;
  const hasDriver = Boolean(driver);
  const rook = driver?.id === ROOK_ID;
  const staging = useMemo(() => {
    const vehicleCenter = measurements.centering.getCenter(new Vector3());
    const doorCenter = driverDoor?.getCenter(new Vector3());
    const side = station.kind === "wheel" ? Math.sign(station.rim[0]) : doorCenter && doorCenter.x > vehicleCenter.x ? 1 : -1;
    const edge = side < 0
      ? Math.min(driverDoor?.min.x ?? Infinity, measurements.bounds.min.x)
      : Math.max(driverDoor?.max.x ?? -Infinity, measurements.bounds.max.x);
    const along = station.kind === "wheel" ? station.seat[2] : doorCenter?.z;
    if (hasDriver && driverReady && along !== undefined && Number.isFinite(edge) && !leanFits.has(layout)) {
      const fit = measureDriverLean(prepared.root, edge + side * .27, measurements.support.min.y, along, side);
      leanFits.set(layout, { fit });
    }
    const fit = driverReady ? leanFits.get(layout)?.fit : undefined;
    return { side, edge, along, fit };
  }, [driverDoor, measurements, prepared, hasDriver, driverReady, layout, station]);
  const inset = inspectBody ? 0 : Math.min(staging.fit?.offset ?? 0, rook ? .14 : .06);
  const lean = useMemo(() => {
    const fit = staging.fit;
    return !rook || inspectBody || !previewPacks || driver?.prop || !fit ? undefined : { ...fit, offset: fit.offset - inset };
  }, [staging.fit, rook, inspectBody, previewPacks, driver?.prop, inset]);
  const driverAcross = staging.edge * display.scale + display.position[0] + staging.side * (.27 - inset) * driverScale;
  // Vehicles without an authored front door still stage beside the front seat.
  const driverAlong = staging.along === undefined ? display.footprint[1] * .12 : staging.along * display.scale + display.position[2];
  const cameraRig = useMemo(() => {
    const size = measurements.bounds.getSize(new Vector3());
    const center = measurements.bounds.getCenter(new Vector3());
    const door = driverDoor?.getCenter(new Vector3()) ?? center;
    const side = staging.side;
    const doorZ = staging.along ?? door.z;
    const height = Math.max(1.3, size.y);
    const width = Math.max(1.65, size.x);
    const length = Math.max(3.2, size.z);
    const shots = [
      { name: "High Angle", at: [center.x, center.y, center.z], eye: [width * .8, length * .93, length * .52] },
      { name: "Driver Door", at: [door.x, Math.max(door.y, height * .62), doorZ], eye: [side * width * 1.42, height * .51, -length * .47] },
      { name: "Chase", at: [center.x, center.y, center.z + length * .15], eye: [-width * .57, height * 1.28, -length * 1.14] },
    ];
    const cockpitShot = garageStationCamera(station);
    shots.push({ name: "Cockpit", at: [...cockpitShot.at], eye: [...cockpitShot.eye] });
    return shots;
  }, [driverDoor, measurements, staging.side, staging.along, station]);
  return (
    <group ref={motion}>
      {driver && <group position={[driverAcross, .023, driverAlong]} scale={driverScale} rotation={[0, staging.side * Math.PI / 2, 0]}>
        {driverReady ? <>
          <group name="garage-driver-shadow"><PreviewContactShadow footprint={[.55, .46]} offset={[0, 0]} /></group>
          <GarageDriver choice={driver} previewPacks={previewPacks} leanFit={lean} cockpit={cockpit} />
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
        {garageOpen && cameraRig.map(shot => <group key={shot.name} name={`garage-view-${shot.name}`}
          position={shot.at as [number, number, number]}>
          <object3D position={shot.eye as [number, number, number]} />
        </group>)}
      </group>
    </group>
  );
}
