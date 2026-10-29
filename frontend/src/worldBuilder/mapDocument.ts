import {footprint, parseLayout, type WorldLayout} from './layoutDocument.ts';
export type Triple=[number,number,number];
type Rotation=[number,number,number,number];
export type ColliderRecord={id:string;kind:string;visual:string;pos:Triple;rot:Rotation;half_extents:Triple;collider:'box';[key:string]:unknown};
export type MapDocument={schema_version:2;map_id:string;coordinate_system:{units:string;up_axis:string;forward_axis:string};cell:[number,number];surface:{road_y:number};layout:{kind:string;[key:string]:unknown};visuals:{id:string;asset:string;position:Triple;rotation:Rotation;scale:Triple}[];roads:ColliderRecord[];buildings:ColliderRecord[];[key:string]:unknown};
export type EditableBox={id:string;kind:string;visual:string;center:Triple;half:Triple;collection:'roads'|'buildings'};
export type PlanBounds={x:number;z:number;width:number;depth:number};
export const MAX_BOXES=2048,MAX_JSON_BYTES=2*1024*1024;
const record=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Expected a JSON object');return v as Record<string,unknown>;};
const finite=(v:unknown,max=1e6)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=max;
const tuple=(v:unknown,n:number)=>Array.isArray(v)&&v.length===n&&v.every(x=>finite(x));
const safeName=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9_,.\- ]{1,160}$/.test(v);
export function parseMapDocument(value:unknown,expectedMap?:string):MapDocument{
 const d=record(value);
 if(d.schema_version!==2||typeof d.map_id!=='string'||!/^[a-zA-Z0-9_-]{1,96}$/.test(d.map_id))throw Error('Use a schema 2 server map definition');
 if(expectedMap&&d.map_id!==expectedMap)throw Error('This definition belongs to a different map');
 const coord=record(d.coordinate_system),surface=record(d.surface),layout=record(d.layout);
 if(coord.units!=='meters'||coord.up_axis!=='y'||!['-z','+z'].includes(String(coord.forward_axis)))throw Error('Map metadata must use metres and Y-up');
 if(!tuple(d.cell,2)||(d.cell as number[]).some(n=>n<=0||n>10000)||!finite(surface.road_y))throw Error('Invalid map cell or road surface');
 if(layout.kind==='fixed_grid'){
  if(!tuple(layout.origin,2)||!(layout.origin as number[]).every(Number.isInteger)||!tuple(layout.size,2)||!(layout.size as number[]).every(n=>Number.isInteger(n)&&n>0&&n<=256))throw Error('Invalid fixed grid');
 }else if(layout.kind!=='streamed'||!Number.isInteger(layout.radius)||(layout.radius as number)<0||(layout.radius as number)>16)throw Error('Invalid map layout');
 if(!Array.isArray(d.visuals)||!d.visuals.length||d.visuals.length>32)throw Error('Expected 1–32 visual assets');
 const visualIds=new Set<string>();
 for(const item of d.visuals){const v=record(item);if(!safeName(v.id)||visualIds.has(String(v.id))||typeof v.asset!=='string'||!/^\/models\/[a-zA-Z0-9_.,/ -]+\.glb$/.test(v.asset)||v.asset.includes('..')||!tuple(v.position,3)||!tuple(v.rotation,4)||!tuple(v.scale,3)||(v.scale as number[]).some(n=>n<=0||n>10000)||Math.abs(Math.hypot(...v.rotation as number[])-1)>.001)throw Error('Invalid visual asset or transform');visualIds.add(String(v.id));}
 const roads=d.roads??[],buildings=d.buildings??[];
 if(!Array.isArray(roads)||!Array.isArray(buildings)||roads.length+buildings.length>MAX_BOXES)throw Error(`Limit this template to ${MAX_BOXES} boxes`);
 const ids=new Set<string>();
 for(const item of [...roads,...buildings]){const b=record(item);if(!safeName(b.id)||ids.has(String(b.id))||!['road','intersection','building','block','prop'].includes(String(b.kind))||typeof b.visual!=='string'||b.visual.length>160||b.collider!=='box'||!tuple(b.pos,3)||!tuple(b.half_extents,3)||(b.half_extents as number[]).some(n=>n<.01||n>10000)||!tuple(b.rot,4))throw Error('Invalid or duplicate collider box');if((b.destructible!==undefined&&typeof b.destructible!=='boolean')||(b.state!==undefined&&!['intact','damaged','destroyed','removed'].includes(String(b.state))))throw Error('Invalid collider state');if((b.rot as number[]).some((n,i)=>Math.abs(n-(i===3?1:0))>.00001))throw Error('This first editor supports axis-aligned boxes only');ids.add(String(b.id));}
 if(d.team_spawns){const teams=record(d.team_spawns);for(const key of ['red','blue']){const entries=teams[key]??[];if(!Array.isArray(entries)||entries.length>256)throw Error('Invalid team spawn list');for(const value of entries){const p=record(value);if(!tuple(p.chunk,2)||!(p.chunk as number[]).every(Number.isInteger)||!tuple(p.local,2)||(p.yaw!==undefined&&!finite(p.yaw)))throw Error('Invalid team spawn');}}}
 if(d.authored_layout!==undefined)parseLayout(d.authored_layout,d.map_id);
 return structuredClone({...d,roads,buildings}) as MapDocument;
}
export function parseMapText(text:string,expectedMap?:string){if(new TextEncoder().encode(text).length>MAX_JSON_BYTES)throw Error('Map JSON exceeds 2 MiB');return parseMapDocument(JSON.parse(text),expectedMap);}
// Existing schema 2 records are Blender XYZ even though map metadata says Y-up.
// Match the Rust conversion exactly once. Visual transforms are already runtime.
export function editableBoxes(doc:MapDocument):EditableBox[]{
 return (['roads','buildings'] as const).flatMap(collection=>doc[collection].map(b=>({id:b.id,kind:b.kind,visual:b.visual,collection,center:[b.pos[0],b.pos[2],-b.pos[1]] as Triple,half:[b.half_extents[0],b.half_extents[2],b.half_extents[1]] as Triple})));
}
export function editBox(doc:MapDocument,id:string,center:Triple,half:Triple):MapDocument{
 if(!tuple(center,3)||!tuple(half,3)||half.some(v=>v<.01||v>10000))throw Error('Box size must be positive and coordinates finite');
 const collection=doc.roads.some(b=>b.id===id)?'roads':doc.buildings.some(b=>b.id===id)?'buildings':null;
 if(!collection)throw Error('Select a collider first');
 return {...doc,[collection]:doc[collection].map(b=>b.id===id?{...b,pos:[center[0],-center[2],center[1]],half_extents:[half[0],half[2],half[1]]}:b)};
}
export function addBox(doc:MapDocument,kind:'road'|'building',at:Triple=[0,doc.surface.road_y,0]):MapDocument{
 if(doc.roads.length+doc.buildings.length>=MAX_BOXES)throw Error('Collider budget reached');
 const ids=new Set([...doc.roads,...doc.buildings].map(b=>b.id));let n=1;while(ids.has(`authored_${kind}_${n}`))n++;
 const h=kind==='road'?.05:2.5,center:[number,number,number]=[at[0],at[1]+(kind==='road'?-h:h),at[2]];
 const b:ColliderRecord={id:`authored_${kind}_${n}`,kind,visual:'Manual collider',collider:'box',pos:[center[0],-center[2],center[1]],half_extents:[2.5,2.5,h],rot:[0,0,0,1],destructible:false,state:'intact'};
 const collection=kind==='road'?'roads':'buildings';return {...doc,[collection]:[...doc[collection],b]};
}
export function removeBox(doc:MapDocument,id:string):MapDocument{return {...doc,roads:doc.roads.filter(b=>b.id!==id),buildings:doc.buildings.filter(b=>b.id!==id)};}
export function snapValue(value:number,step:number){return Number((Math.round(value/step)*step).toFixed(6));}
export function planBounds(doc:MapDocument):PlanBounds{
 const boxes=editableBoxes(doc),minX=Math.min(-doc.cell[0]/2,...boxes.map(b=>b.center[0]-b.half[0])),maxX=Math.max(doc.cell[0]/2,...boxes.map(b=>b.center[0]+b.half[0])),minZ=Math.min(-doc.cell[1]/2,...boxes.map(b=>b.center[2]-b.half[2])),maxZ=Math.max(doc.cell[1]/2,...boxes.map(b=>b.center[2]+b.half[2]));
 const pad=Math.max(2,Math.max(maxX-minX,maxZ-minZ)*.03);return {x:minX-pad,z:minZ-pad,width:maxX-minX+2*pad,depth:maxZ-minZ+2*pad};
}
export function planPoint(x:number,y:number,rect:{left:number;top:number;width:number;height:number},view:PlanBounds):[number,number]|null{
 const ratio=Math.min(rect.width/view.width,rect.height/view.depth);if(!Number.isFinite(ratio)||ratio<=0)return null;
 const px=(x-rect.left-(rect.width-view.width*ratio)/2)/ratio,pz=(y-rect.top-(rect.height-view.depth*ratio)/2)/ratio;
 return px<0||pz<0||px>view.width||pz>view.depth?null:[view.x+px,view.z+pz];
}
export function pickBox(boxes:EditableBox[],x:number,z:number){return boxes.filter(b=>Math.abs(x-b.center[0])<=b.half[0]&&Math.abs(z-b.center[2])<=b.half[2]).sort((a,b)=>a.half[0]*a.half[2]-b.half[0]*b.half[2])[0]??null;}
export function colliderPath(boxes:EditableBox[]){return boxes.map(b=>`M${b.center[0]-b.half[0]} ${b.center[2]-b.half[2]}h${b.half[0]*2}v${b.half[2]*2}h${-b.half[0]*2}Z`).join('');}
// Finite districts export once: a 240 m road must not silently repeat every
// 200 m city tile. Legacy layouts retain their existing repetition behavior.
export function withLayoutMap(doc: MapDocument, layout: WorldLayout): MapDocument {
 const result={...doc,authored_layout:layout};
 if(layout.base!=='replace'||layout.repeat!==false)return result;
 const points=layout.objects.flatMap(footprint),extent=(axis:number)=>Math.max(100,...points.map(p=>Math.abs(p[axis])+16))*2;
 const cell:[number,number]=[extent(0),extent(1)];
 if(cell.some(n=>n>10000))throw Error('Single district exceeds the 10 km map cell limit');
 const road=layout.objects.find(o=>o.solid&&o.road?.collision.surface);
 if(!road)return {...result,cell,layout:{kind:'fixed_grid',origin:[0,0],size:[1,1]}};
 const a=road.yaw*Math.PI/180,c=Math.cos(a),s=Math.sin(a),offset=Math.min(10,road.size[2]*.1);
 const spawn=(direction:number)=>({chunk:[0,0],local:[road.position[0]+s*offset*direction,road.position[2]+c*offset*direction],yaw:a+(direction<0?Math.PI:0)});
 return {...result,cell,layout:{kind:'fixed_grid',origin:[0,0],size:[1,1]},surface:{road_y:road.position[1]},team_spawns:{red:[spawn(1)],blue:[spawn(-1)]}};
}
export function mapExport(doc:MapDocument){const authored=doc.authored_layout?parseLayout(doc.authored_layout,doc.map_id):null,result=parseMapDocument(authored?withLayoutMap(doc,authored):doc),meta=typeof result.metadata==='object'&&result.metadata!==null?result.metadata as Record<string,unknown>:{};result.metadata={...meta,building_collider_count:result.buildings.length,road_collider_count:result.roads.length};return JSON.stringify(result,null,2)+'\n';}
