import { FACTORY_APPEARANCE, useHeroLoadouts } from "../../vehicles/cosmetics/heroLoadouts";
import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { prepareVehicleVisual } from "../../vehicles/tools/vehicleMaterials";
import {
  VEHICLE_MODEL_PATHS,
  type VehicleModelId,
} from "../../vehicles/tools/vehicleModelPaths";
import { fitPreviewToPlatform, measurePreviewBounds } from "./previewPlacement";
import { PreviewContactShadow } from "./PreviewContactShadow";
import { applyShowroomHighlights, applyShowroomPaint } from "./garageVehiclePaint";
import { prepareGarageVehiclePaint } from "./garageVehiclePaint";
import {createVehiclePartRig,advanceVehiclePartRig,availableVehicleParts} from "./vehiclePartRig";
import {useVehicleStudioStore} from "../heroes/vehicleStudioStore";
import {useInputStore} from "../../store/input/inputStore";
import {VehicleFlags,hasFlag} from "../../store/input/protocol/inputMasks";
import {Mesh,MeshStandardMaterial} from "three";
import {useFrame} from "@react-three/fiber";
import {useRef} from "react";

// Selection is always the complete GLB, independent of in-game debug modes.
// Shared material preparation retains the TSX fixes without runtime network poses.
export function VehiclePreviewModel({platform,model}:{
  platform: readonly [number, number];
  model: VehicleModelId;
}) {
  const path=VEHICLE_MODEL_PATHS[model];
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
  const partRig=useMemo(()=>createVehiclePartRig(prepared.root,model),[prepared,model]);
  const activeTab=useVehicleStudioStore(s=>s.activeTab);
  const glassStyle=useVehicleStudioStore(s=>s.glassStyle);
  const lamps=useMemo(()=>{
    const headlights=new Set<MeshStandardMaterial>(),signals=new Set<MeshStandardMaterial>(),leftSignals=new Set<MeshStandardMaterial>(),rightSignals=new Set<MeshStandardMaterial>();
    prepared.root.traverse(object=>{
      if(!(object instanceof Mesh))return;
      const objectName=object.name;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(const value of materials){
        if(!(value instanceof MeshStandardMaterial))continue;
        const name=`${objectName} ${value.name}`.toLowerCase();
        if(/head.?light|headlamp|front.?light/.test(name))headlights.add(value);
        if(/indicator|turn.?signal|blinker|amber|ambar|orange|oarnge|tail.?lens|tail.?light|reflector|vehiclelights|lights\./.test(name)){
          signals.add(value);
          if(/left|(?:^|[_ .-])l(?:[_ .-]|$)|_fl|_rl/.test(name))leftSignals.add(value);
          if(/right|(?:^|[_ .-])r(?:[_ .-]|$)|_fr|_rr/.test(name))rightSignals.add(value);
        }
      }
    });
    const all=new Set([...headlights,...signals]);
    return {headlights,signals,leftSignals,rightSignals,all,originals:new Map([...all].map(material=>[material,{emissive:material.emissive.clone(),intensity:material.emissiveIntensity}] as const))};
  },[prepared]);
  const lastLampStyle=useRef("");
  useEffect(() => () => prepared.dispose(), [prepared]);
  useEffect(()=>{lastLampStyle.current="";},[lamps]);
  useEffect(()=>{
    useVehicleStudioStore.getState().reset();
    useVehicleStudioStore.getState().setAvailable(model,[...availableVehicleParts(partRig)]);
    return ()=>{if(useVehicleStudioStore.getState().availableVehicle===model)useVehicleStudioStore.getState().setAvailable(null);};
  },[model,partRig]);
  useEffect(()=>{
    const profile={
      clear:{color:"#68747d",opacity:0.24,roughness:0.2,specular:"#b9c2c9",specularIntensity:0.42,ior:1.36},
      "light-smoke":{color:"#3d4852",opacity:0.5,roughness:0.2,specular:"#aeb7bf",specularIntensity:0.34,ior:1.33},
      "dark-smoke":{color:"#202830",opacity:0.68,roughness:0.22,specular:"#929ca5",specularIntensity:0.27,ior:1.3},
    }[glassStyle];
    for(const material of prepared.glassMaterials){
      material.color.set(profile.color);
      material.opacity=profile.opacity;
      material.roughness=profile.roughness;
      material.specularColor.set(profile.specular);
      material.specularIntensity=profile.specularIntensity;
      material.ior=profile.ior;
      material.metalness=0;
      material.transmission=0;
    }
  },[prepared,glassStyle]);
  useEffect(()=>{
    if(!activeTab)return;
    const hasHood=partRig.some(part=>part.part==="hood");
    useVehicleStudioStore.getState().setPart("hood",activeTab==="performance"&&hasHood);
  },[activeTab,partRig]);
  useEffect(() => {
    const appearance = savedAppearance ?? FACTORY_APPEARANCE;
    applyShowroomPaint(prepared.root, model, "factory", appearance.body === "factory" ? undefined : appearance.body);
    applyShowroomHighlights(prepared.root, .45, appearance.finish, appearance.metallic, model);
  }, [prepared, model, savedAppearance]);
  useFrame((state,delta)=>{
    advanceVehiclePartRig(partRig,useVehicleStudioStore.getState().parts,delta);
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
  return (
    <>
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
    </>
  );
}
