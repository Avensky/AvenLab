import { useFrame } from "@react-three/fiber";
import { useUIStore } from "../../store/menus/uiStore";
import { useHeroLoadouts } from "./heroLoadouts";
import { useEffect, useRef, type RefObject } from "react";
import { Mesh, MeshStandardMaterial, type Object3D, type Material } from "three";
import { useNetworkStore } from "../../store/session/networkStore";
import { applyShowroomPaint, applyShowroomHighlights } from "../../game/preview/garageVehiclePaint";
import { FACTORY_APPEARANCE, type HeroAppearance } from "./heroLoadouts";
/** Snapshot appearance is authoritative. Clone only this instance's body paint;
 * never recolor cached GLTF materials or another player's vehicle. */
export function useLiveAppearance(ref: RefObject<Object3D|null>, model:string, entityId?:string) {
 const changing=useUIStore(s=>s.overlay === "vehicle_select");
 const local=useNetworkStore(s=>s.playerId);
 const preview=useHeroLoadouts(s=>s.loadouts[model]);
 const networkKey=useNetworkStore(s=>JSON.stringify(s.snapshot?.entities.find(e=>e.id===(entityId??s.playerId))?.appearance??FACTORY_APPEARANCE));
 const key=changing && (!entityId || entityId===local) ? JSON.stringify(preview??FACTORY_APPEARANCE) : networkKey;
 const applied=useRef<{root:Object3D;key:string;restore:()=>void}|null>(null);
 useEffect(()=>{const state=applied;return()=>{state.current?.restore();state.current=null;};},[]);
 // R3F may attach the owned primitive after React layout effects. Apply once
 // on the first ready frame, then only when the authoritative loadout changes.
 useFrame(()=>{
  const root=ref.current;if(!root)return;
  if(applied.current?.root===root&&applied.current.key===key)return;
  applied.current?.restore();
  const originals=new Map<Mesh,Material|Material[]>(),owned=new Map<Material,Material>();
  root.traverse(o=>{if(!(o instanceof Mesh))return;const own=(m:Material)=>{
   if(!(m instanceof MeshStandardMaterial)||!/^Primary(?:\.\d+)?$|^body$|^ext(?:\.\d+)?$|PaintTNR_Material1$/.test(m.name))return m;
   if(!owned.has(m))owned.set(m,m.clone());return owned.get(m)!;
  };originals.set(o,o.material);o.material=Array.isArray(o.material)?o.material.map(own):own(o.material);});
  const appearance=JSON.parse(key) as HeroAppearance;
  applyShowroomPaint(root,model,"factory",appearance.body==="factory"?undefined:appearance.body);
  applyShowroomHighlights(root,.45,appearance.finish);
  applied.current={root,key,restore:()=>{for(const [mesh,material]of originals)mesh.material=material;for(const m of owned.values())m.dispose();}};
 });
}
