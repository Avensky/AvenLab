import { useConnectionView, useMotionView } from "../../store/session/networkViews";
import {useShallow} from 'zustand/react/shallow';
import { useFrame } from "@react-three/fiber";
import { useUIStore } from "../../store/menus/uiStore";
import { useHeroLoadouts } from "./heroLoadouts";
import { useEffect, useRef, type RefObject } from "react";
import { Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Object3D, type Material } from "three";
import {snapshotEntity} from "../../store/session/networkStore";
import { applyShowroomPaint, applyShowroomHighlights, hasVehicleFinish } from "../../game/preview/garageVehiclePaint";
import {useRenderSettingsStore} from '../../store/presentation/renderSettingsStore';
import { FACTORY_APPEARANCE, type HeroAppearance } from "./heroLoadouts";
/** Snapshot appearance is authoritative. Clone only this instance's body paint;
 * never recolor cached GLTF materials or another player's vehicle. */
export function useLiveAppearance(ref: RefObject<Object3D|null>, model:string, entityId?:string) {
 const lowDetail=useRenderSettingsStore(s=>s.lowDetail);
 const inFleet=useMotionView(s=>(s.snapshot?.entities.length??0)>=3);
 const simplifyTransmission=lowDetail||inFleet;
 const changing=useUIStore(s=>s.overlay === "vehicle_select");
 const local=useConnectionView(s => s.playerId);
 const preview=useHeroLoadouts(s=>s.loadouts[model]);
 const confirmed=useMotionView(useShallow(s=>snapshotEntity(s.snapshot,entityId??s.playerId)?.appearance??FACTORY_APPEARANCE));
 const appearance=changing && (!entityId || entityId===local) ? preview??FACTORY_APPEARANCE : confirmed;
 const applied=useRef<{root:Object3D;simplifyTransmission:boolean;appearance:HeroAppearance;restore:()=>void}|null>(null);
 useEffect(()=>{const state=applied;return()=>{state.current?.restore();state.current=null;};},[]);
 // R3F may attach the owned primitive after React layout effects. Apply once
 // on the first ready frame, then only when the authoritative loadout changes.
 useFrame(()=>{
  const root=ref.current;if(!root)return;
  if(applied.current?.root===root&&applied.current.appearance===appearance&&applied.current.simplifyTransmission===simplifyTransmission)return;
  applied.current?.restore();
  const originals=new Map<Mesh,Material|Material[]>(),owned=new Map<Material,Material>();
  const own=(material:Material)=>{
   if(!(material instanceof MeshStandardMaterial))return material;
   const simpleGlass=simplifyTransmission&&material instanceof MeshPhysicalMaterial&&material.transmission>0;
   if(!simpleGlass&&!hasVehicleFinish(material.name))return material;
   const existing=owned.get(material);if(existing)return existing;
   const clone=material.clone();
   if(simpleGlass&&clone instanceof MeshPhysicalMaterial){
    // Transmission asks Three to render the opaque scene into a second target.
    // Tinted glass keeps the local cockpit transparent in a crowded fight.
    if(/glass|lens|window|windshield/i.test(clone.name)){
     clone.transparent=true;clone.opacity=Math.min(clone.opacity,.42);clone.depthWrite=false;clone.forceSinglePass=true;
    }
    clone.transmission=0;
   }
   owned.set(material,clone);return clone;
  };
  root.traverse(object=>{
   if(!(object instanceof Mesh))return;
   const original=object.material;
   const next=Array.isArray(original)?original.map(own):own(original);
   if(next===original)return;
   originals.set(object,original);object.material=next;
  });
  applyShowroomPaint(root,model,"factory",appearance.body==="factory"?undefined:appearance.body);
  applyShowroomHighlights(root,.45,appearance.finish);
  applied.current={root,simplifyTransmission,appearance,restore:()=>{for(const [mesh,material]of originals)mesh.material=material;for(const m of owned.values())m.dispose();}};
 });
}
