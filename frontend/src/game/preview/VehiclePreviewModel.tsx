import { FACTORY_APPEARANCE, useHeroLoadouts } from "../../vehicles/cosmetics/heroLoadouts";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
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
import {Mesh,MeshStandardMaterial,Vector3,type Group} from "three";
import { GarageDriver } from "../characters/GarageDriver";
import { ROOK_ID, type CharacterChoice } from "../characters/characterCatalog";
import {useFrame} from "@react-three/fiber";
import {applyWindowTone} from "./windowTones";
import {vehicleSystems} from "../../vehicles/vehicleSystems";
import { prepareGarageCockpit } from "./garageCockpit";
import { useCharacterPreviewStore } from "../characters/characterPreviewStore";

// Selection is always the complete GLB, independent of in-game debug modes.
// Shared material preparation retains the TSX fixes without runtime network poses.
export function VehiclePreviewModel({platform,model,driver,previewPacks}:{
  platform: readonly [number, number];
  model: VehicleModelId;
  driver?: CharacterChoice | null;
  previewPacks?: boolean;
}) {
  const path=VEHICLE_MODEL_PATHS[model];
  const motion = useRef<Group>(null);
  const savedAppearance = useHeroLoadouts(s => s.draft?.vehicle === model ? s.draft.appearance : s.loadouts[model]);
  const { scene } = useGLTF(path, "/draco/");
  const prepared = useMemo(
    () => {
      const visual = prepareVehicleVisual(scene, model);
      prepareGarageVehiclePaint(visual.root, model);
      return visual;
    },
    [scene, model],
  );
  const cockpit = useMemo(() => previewPacks && model === "ae86"
    ? prepareGarageCockpit(prepared.root, () => motion.current, prepared.glassMaterials) : undefined, [prepared, model, previewPacks]);
  const cockpitAvailable = Boolean(driver && cockpit);
  useLayoutEffect(() => {
    if (!cockpitAvailable) return;
    useCharacterPreviewStore.setState({ cockpitAvailable: true });
    return () => useCharacterPreviewStore.setState({ cockpitAvailable: false });
  }, [cockpitAvailable]);
  const driverDoor = useMemo(() => vehicleSystems(model) === "road" ? measureDriverDoor(prepared.root) : null, [prepared, model]);
  const partRig=useMemo(()=>createVehiclePartRig(prepared.root,model),[prepared,model]);
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
    advanceVehiclePartRig(partRig,studio.parts,delta);
    if (marine) {
      const {navigation,searchlights}=studio.marineLights;
      const key=`${navigation}:${searchlights}`;
      if(lastLampStyle.current===key)return;
      lastLampStyle.current=key;
      for(const material of lamps.all){
        const active = lamps.navigation.has(material) ? navigation : searchlights;
        const original = lamps.originals.get(material)!;
        if (active) { material.emissive.set(0xffecd4); material.emissiveIntensity=.9; }
        else { material.emissive.copy(original.emissive); material.emissiveIntensity=original.intensity; }
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
      if(activeSignal){material.emissive.set(0xff8a16);material.emissiveIntensity=1.75;}
      else if(activeHeadlight){material.emissive.set(0xffedbc);material.emissiveIntensity=1.35;}
      else {material.emissive.copy(original.emissive);material.emissiveIntensity=original.intensity;}
    }
  });
  // Keep the original measurements when the garage finishes loading; re-reading
  // a mounted model would measure its already-scaled parent a second time.
  const measurements = useMemo(
    () => measurePreviewBounds(prepared.root, model),
    [prepared, model],
  );
  const display = useMemo(
    () => fitPreviewToPlatform(measurements, platform),
    [measurements, platform],
  );
  const driverScale = marine ? 1.35 : display.scale;
  const rook = driver?.id === ROOK_ID;
  const staging = useMemo(() => {
    const vehicleCenter = measurements.centering.getCenter(new Vector3());
    const doorCenter = driverDoor?.getCenter(new Vector3());
    const side = doorCenter && doorCenter.x > vehicleCenter.x ? 1 : -1;
    const edge = side < 0
      ? Math.min(driverDoor?.min.x ?? Infinity, measurements.bounds.min.x)
      : Math.max(driverDoor?.max.x ?? -Infinity, measurements.bounds.max.x);
    const lean = rook && doorCenter && Number.isFinite(edge)
      ? measureDriverLean(prepared.root, edge + side * .27, measurements.support.min.y, doorCenter.z, side)
      : undefined;
    return { side, edge, along: doorCenter?.z, lean };
  }, [driverDoor, measurements, prepared, rook]);
  const lean = inspectBody || previewPacks || driver?.prop ? undefined : staging.lean;
  const driverAcross = staging.edge * display.scale + display.position[0] + staging.side * .27 * driverScale;
  // Vehicles without an authored front door still stage beside the front seat.
  const driverAlong = staging.along === undefined ? display.footprint[1] * .12 : staging.along * display.scale + display.position[2];
  return (
    <group ref={motion}>
      {driver && <group position={[driverAcross, .023, driverAlong]} scale={driverScale} rotation={[0, staging.side * Math.PI / 2, 0]}>
        <group name="garage-driver-shadow"><PreviewContactShadow footprint={[.55, .46]} offset={[0, 0]} /></group>
        <GarageDriver choice={driver} previewPacks={previewPacks} leanFit={lean} cockpit={cockpit} />
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
      </group>
    </group>
  );
}
