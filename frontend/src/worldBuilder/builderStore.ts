import {create} from 'zustand';
import {addBox,editableBoxes,editBox,mapExport,parseMapText,planBounds,removeBox,type MapDocument,type PlanBounds,type Triple} from './mapDocument';
type BuilderState={
 workspace:'layout'|'colliders';
 doc:MapDocument|null;saved:MapDocument|null;past:MapDocument[];future:MapDocument[];selected:string|null;bounds:PlanBounds|null;loadingMap:string|null;
 view:'plan'|'3d';tool:'select'|'move';preset:'iso'|'top';zoom:number;snap:number;status:string;source:string;
 load:(doc:MapDocument,source:string,saved?:boolean)=>void;commit:(doc:MapDocument)=>void;select:(id:string|null)=>void;cycle:(direction:number)=>void;
 edit:(center:Triple,half:Triple)=>void;add:(kind:'road'|'building')=>void;remove:()=>void;undo:()=>void;redo:()=>void;save:()=>void;restore:()=>void;fit:()=>void;
};
let storagePrefix="avenlab-world-builder-v1";
export const configurePreviewStorage=()=>{storagePrefix="avenlab-world-builder-preview-v1";};
export const builderStorageKey=(map:string)=>`${storagePrefix}:${map}`;
export const useBuilderStore=create<BuilderState>((set,get)=>({
 workspace:'layout',doc:null,saved:null,past:[],future:[],selected:null,bounds:null,loadingMap:null,view:'plan',tool:'select',preset:'iso',zoom:1,snap:.5,status:'Loading map definition…',source:'',
 load:(doc,source,saved=false)=>set({doc,saved:saved?doc:null,past:[],future:[],selected:editableBoxes(doc)[0]?.id??null,bounds:planBounds(doc),view:'plan',tool:'select',zoom:1,source,status:'LOCAL DRAFT · Edits affect the shared tile template, not the running server.'}),
 commit:doc=>{const s=get();if(!s.doc)return;set({doc,past:[...s.past,s.doc].slice(-32),future:[],selected:editableBoxes(doc).some(b=>b.id===s.selected)?s.selected:editableBoxes(doc)[0]?.id??null,status:'Unsaved draft · Export and restart the server to apply collisions.'});},
 select:selected=>set({selected}),
 cycle:direction=>{const s=get();if(!s.doc)return;const boxes=editableBoxes(s.doc);if(!boxes.length)return;const index=boxes.findIndex(b=>b.id===s.selected);set({selected:boxes[(index+direction+boxes.length)%boxes.length].id});},
 edit:(center,half)=>{const s=get();if(s.doc&&s.selected)s.commit(editBox(s.doc,s.selected,center,half));},
 add:kind=>{const s=get();if(!s.doc)return;const box=s.selected?editableBoxes(s.doc).find(b=>b.id===s.selected):null;const doc=addBox(s.doc,kind,box?[box.center[0]+box.half[0]*2+1,s.doc.surface.road_y,box.center[2]]:undefined);s.commit(doc);set({selected:editableBoxes(doc).filter(b=>b.kind===kind).at(-1)!.id});},
 remove:()=>{const s=get();if(s.doc&&s.selected)s.commit(removeBox(s.doc,s.selected));},
 undo:()=>{const s=get(),doc=s.past.at(-1);if(!doc||!s.doc)return;set({doc,past:s.past.slice(0,-1),future:[s.doc,...s.future].slice(0,32),selected:editableBoxes(doc).some(b=>b.id===s.selected)?s.selected:editableBoxes(doc)[0]?.id??null,status:'Undo · Draft only'});},
 redo:()=>{const s=get(),doc=s.future[0];if(!doc||!s.doc)return;set({doc,past:[...s.past,s.doc].slice(-32),future:s.future.slice(1),selected:editableBoxes(doc).some(b=>b.id===s.selected)?s.selected:editableBoxes(doc)[0]?.id??null,status:'Redo · Draft only'});},
 save:()=>{const s=get();if(!s.doc)return;try{localStorage.setItem(builderStorageKey(s.doc.map_id),mapExport(s.doc));set({saved:s.doc,status:'Saved in this browser · Export JSON to update the server.'});}catch{set({status:'Browser save unavailable. Export JSON to keep this draft.'});}},
 restore:()=>{const s=get();if(!s.doc)return;try{const text=localStorage.getItem(builderStorageKey(s.doc.map_id));if(!text)throw Error('No saved draft for this map');s.commit(parseMapText(text,s.doc.map_id));set({saved:get().doc,status:'Restored browser draft · Undo remains available.'});}catch(error){set({status:error instanceof Error?error.message:'Could not restore draft'});}},
 fit:()=>{const s=get();if(s.doc)set({bounds:planBounds(s.doc),zoom:1});},
}));
