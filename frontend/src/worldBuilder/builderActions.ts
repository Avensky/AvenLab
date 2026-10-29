import {useUIStore} from '../store/uiStore';
import {useWorldStore,type MapSnapshot} from '../store/worldStore';
import {useInputStore} from '../store/inputStore';
import {leaveInspection} from '../store/inspectionActions';
import {builderStorageKey,useBuilderStore} from './builderStore';
import {editableBoxes,mapExport,parseMapText,type MapDocument} from './mapDocument';
let request=0;
export function compareLiveTemplate(doc:MapDocument,map:MapSnapshot){
 const chunk=map.chunks[0],live=chunk&&map.collider_chunks?.find(c=>c.x===chunk.x&&c.z===chunk.z);
 if(!chunk||!live)return 'Live collider comparison unavailable';
 const boxes=editableBoxes(doc),matches=boxes.length===live.boxes.length&&boxes.every(b=>{const box=live.boxes.find(v=>v.id===b.id);return box&&b.center.every((v,i)=>Math.abs(v+chunk.origin[i]-box.center[i])<.002)&&b.half.every((v,i)=>Math.abs(v-box.half_extents[i])<.002);});
 return matches?'Source matches loaded collider template':'Source differs from server · Draft preview only';
}
export async function openWorldBuilder(){
 const ui=useUIStore.getState(),map=useWorldStore.getState().map;if(ui.screen!=='sandbox'||ui.isModeLoading||!map)return;
 const token=++request;leaveInspection();useInputStore.getState().releaseControls();ui.setOverlay('world_builder');
 const state=useBuilderStore.getState();if(state.doc?.map_id===map.map_id)return;
 useBuilderStore.setState({doc:null,status:'Loading map definition…'});
 try{
  let text:string|null=null;try{text=localStorage.getItem(builderStorageKey(map.map_id));}catch{/* Export remains available if storage is blocked. */}
  let doc:MapDocument|null=null;
  if(text){try{doc=parseMapText(text,map.map_id);}catch{/* A corrupt saved draft cannot block the bundled definition. */}}
  const saved=doc!==null;
  if(!doc){if(!/^[a-zA-Z0-9_-]{1,96}$/.test(map.map_id))throw Error('Invalid map id');const response=await fetch(`/world-builder/${map.map_id}_colliders.json`);if(!response.ok)throw Error('Import the server map JSON to begin. Run the frontend build to refresh bundled definitions.');doc=parseMapText(await response.text(),map.map_id);}
  if(useBuilderStore.getState().doc||token!==request||useUIStore.getState().overlay!=='world_builder'||useWorldStore.getState().map?.map_id!==map.map_id)return;
  state.load(doc,`${saved?'Browser draft':'Server source'} · ${compareLiveTemplate(doc,map)}`,saved);
 }catch(error){if(!useBuilderStore.getState().doc&&token===request&&useUIStore.getState().overlay==='world_builder')useBuilderStore.setState({status:error instanceof Error?error.message:'Map definition unavailable'});}
}
export function closeWorldBuilder(){request++;useInputStore.getState().releaseControls();useUIStore.getState().setOverlay(useUIStore.getState().screen==='sandbox'?'pause':null);}
export function exportBuilderMap(){const doc=useBuilderStore.getState().doc;if(!doc)return;const url=URL.createObjectURL(new Blob([mapExport(doc)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`${doc.map_id}_colliders.json`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),0);useBuilderStore.setState({status:'Exported server map JSON · Install it and restart Rust to apply.'});}
