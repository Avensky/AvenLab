import {useUIStore} from '../store/uiStore';
import {useWorldStore,type MapSnapshot} from '../store/worldStore';
import {useSelectionStore} from '../store/selectionStore';
import {useInputStore} from '../store/inputStore';
import {leaveInspection} from '../store/inspectionActions';
import {builderStorageKey,useBuilderStore} from './builderStore';
import {editableBoxes,mapExport,parseMapText,type MapDocument} from './mapDocument';
import {useLayoutStore} from './layoutStore';
import {mapCatalog} from '../store/worldCatalog';
import {initialMapLayout} from './layoutDocument';
let request=0;
const bundledSources=new Map<string,MapDocument>();
type LayoutSession=Pick<ReturnType<typeof useLayoutStore.getState>,'doc'|'saved'|'past'|'future'|'selected'|'cursor'|'placementYaw'|'focus'>;
const sessions=new Map<string,{source:MapDocument;layout:LayoutSession}>();
// Offline previews supply the same real fixtures without replacing global fetch.
export function configureBuilderMapSources(sources:MapDocument[]){bundledSources.clear();for(const source of sources)bundledSources.set(source.map_id,source);}
const editing=()=>{const ui=useUIStore.getState();return ui.screen==='world_builder'||ui.overlay==='world_builder';};
function rememberWorld(){
 const source=useBuilderStore.getState().doc,s=useLayoutStore.getState();
 if(!source||s.doc?.map_id!==source.map_id)return;
 window.dispatchEvent(new Event('avenlab:cancel-authoring',{cancelable:true}));
 if(s.doc!==s.saved)s.save();
 const current=useLayoutStore.getState();
 sessions.set(source.map_id,{source,layout:{doc:current.doc,saved:current.saved,past:current.past,future:current.future,selected:current.selected,cursor:current.cursor,placementYaw:current.placementYaw,focus:current.focus}});
 const builder=useBuilderStore.getState();if(builder.past.length&&builder.doc!==builder.saved)builder.save();
}
async function readWorld(mapId:string){
 const embedded=bundledSources.get(mapId);if(embedded)return embedded;
 let text:string|null=null;try{text=localStorage.getItem(builderStorageKey(mapId));}catch{/* In-memory sessions still retain work. */}
 if(text){try{return parseMapText(text,mapId);}catch{/* Load the bundled map if a saved source is corrupt. */}}
 const response=await fetch(`/world-builder/${mapId}_colliders.json`);
 if(!response.ok)throw Error('Map source unavailable. Run the frontend build to refresh world definitions.');
 return parseMapText(await response.text(),mapId);
}
export async function switchBuilderWorld(mapId:string){
 if(!editing())return;
 if(!/^[a-zA-Z0-9_-]{1,96}$/.test(mapId)||(!mapCatalog.some(m=>m.id===mapId)&&!bundledSources.has(mapId)&&useBuilderStore.getState().doc?.map_id!==mapId))throw Error('Unknown editor world');
 const token=++request;
 if(useBuilderStore.getState().doc?.map_id===mapId){useBuilderStore.setState({loadingMap:null});return;}
 rememberWorld();useBuilderStore.setState({loadingMap:mapId,status:'Opening world…'});useLayoutStore.setState({placing:null,status:'Opening world…'});
 try{
  const session=sessions.get(mapId),doc=session?.source??await readWorld(mapId);
  if(token!==request||!editing())return;
  rememberWorld();
  useBuilderStore.getState().load(doc,'World editor · '+(mapCatalog.find(m=>m.id===mapId)?.name??mapId));
  if(session)useLayoutStore.setState({...session.layout,placing:null,reference:false,cameraRevision:useLayoutStore.getState().cameraRevision+1,status:'World restored · local draft.'});
  else {useLayoutStore.getState().initialize(doc.map_id,initialMapLayout(doc.map_id,doc.authored_layout));useLayoutStore.setState({cursor:[0,doc.surface.road_y,0],focus:'layout',status:'World ready · local draft.'});}
 }catch(error){if(token===request){const status=error instanceof Error?error.message:'Could not open world';useBuilderStore.setState({status});useLayoutStore.setState({status});}}
 finally{if(token===request)useBuilderStore.setState({loadingMap:null});}
}
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
export async function loadStandaloneBuilder(){
 if(useBuilderStore.getState().loadingMap)return;
 const mapId=useBuilderStore.getState().doc?.map_id??useSelectionStore.getState().getSelectedMap?.()?.id??'streaming_endless_city';
 await switchBuilderWorld(mapId);
}
export function closeWorldBuilder(){request++;rememberWorld();const layout=useLayoutStore.getState();if(layout.doc&&layout.doc!==layout.saved)layout.save();useInputStore.getState().releaseControls();const ui=useUIStore.getState();if(ui.screen==='world_builder')ui.setScreen('main');else ui.setOverlay(ui.screen==='sandbox'?'pause':null);useBuilderStore.setState({workspace:'layout',loadingMap:null});}
export function exportBuilderMap(){const doc=useBuilderStore.getState().doc;if(!doc)return;const url=URL.createObjectURL(new Blob([mapExport(doc)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`${doc.map_id}_colliders.json`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),0);useBuilderStore.setState({status:'Exported server map JSON · Install it and restart Rust to apply.'});}
