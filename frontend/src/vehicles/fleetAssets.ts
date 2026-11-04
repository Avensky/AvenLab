import {BufferGeometry, BufferAttribute, Color, Group, Mesh, MeshStandardMaterial} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';
import seeds from './fleetSeeds.json';
import type {FleetDetail} from './fleetDetail';

type Model=keyof typeof seeds;
type Art={scene:Group;tier:FleetDetail|'seed'};
type Request={model:Model;tier:FleetDetail;users:number;loading:boolean;retryAt:number;art?:Art};
const rank={near:3,medium:2,far:1};
const entries=new Map<string,Request>(),bases=new Map<Model,Art>(),listeners=new Set<()=>void>();
let revision=0,active=0,loader:GLTFLoader|undefined,retryTimer:ReturnType<typeof setTimeout>|undefined;
const key=(model:string,tier:FleetDetail)=>model+'-'+tier;
const isModel=(model:string):model is Model=>Object.hasOwn(seeds,model);
export const subscribeFleetArt=(fn:()=>void)=>{listeners.add(fn);return ()=>{listeners.delete(fn);};};
export const fleetArtVersion=()=>revision;

function loadNext(){
  if(!loader){
    const decoder=new DRACOLoader().setDecoderPath('/draco/').setWorkerLimit(2);
    loader=new GLTFLoader().setDRACOLoader(decoder);
  }
  const now=Date.now();
  const waiting=[...entries.values()].filter(e=>e.users>0&&!e.art&&!e.loading);
  waiting.sort((a,b)=>rank[b.tier]-rank[a.tier]);
  clearTimeout(retryTimer);
  let nextRetry=Infinity;
  for(const e of waiting){
    if(e.retryAt>now){nextRetry=Math.min(nextRetry,e.retryAt);continue;}
    if(active>=2)break;
    active++;e.loading=true;
    loader.loadAsync('/models/vehicles/lod/'+key(e.model,e.tier)+'.glb').then(gltf=>{
      e.art={scene:gltf.scene,tier:e.tier};revision++;listeners.forEach(fn=>fn());
    }).catch(()=>{e.retryAt=Date.now()+15000;}).finally(()=>{e.loading=false;active--;loadNext();});
  }
  if(Number.isFinite(nextRetry))retryTimer=setTimeout(loadNext,Math.max(0,nextRetry-Date.now()));
}

/** Coalesce duplicate requests and drop queued work if the camera has moved on. */
export function retainFleetArt(model:string,tier:FleetDetail){
  if(!isModel(model))return ()=>{};
  const id=key(model,tier);
  let e=entries.get(id);
  if(!e){e={model,tier,users:0,loading:false,retryAt:0};entries.set(id,e);}
  e.users++;loadNext();
  return ()=>{e.users--;};
}

/** Small authored exteriors travel with the game. Decode only the models in
 * this room. All attributes use fixed-point little-endian storage. */
function baseArt(model:Model):Art{
  const previous=bases.get(model);
  if(previous)return previous;
  const scene=new Group();
  for(const part of seeds[model]){
    const bytes=Uint8Array.from(atob(part.data),c=>c.charCodeAt(0));
    const n=part.vertices,geometry=new BufferGeometry(),positions=new Float32Array(n*3);
    const fixed=new Int16Array(bytes.buffer,0,n*3);
    for(let i=0;i<fixed.length;i++)positions[i]=fixed[i]/1000;
    geometry.setAttribute('position',new BufferAttribute(positions,3));
    geometry.setAttribute('normal',new BufferAttribute(new Int8Array(bytes.buffer,6*n,3*n),3,true));
    if(part.name!=='paint')geometry.setAttribute('color',new BufferAttribute(new Uint8Array(bytes.buffer,9*n,3*n),3,true));
    geometry.setIndex(new BufferAttribute(new Uint16Array(bytes.buffer,12*n),1));
    const material=new MeshStandardMaterial({color:new Color().fromArray(part.color),vertexColors:part.name!=='paint',metalness:.22,roughness:part.name==='glass'?.22:.48});
    const mesh=new Mesh(geometry,material);mesh.name=part.name;mesh.position.fromArray(part.pivot);scene.add(mesh);
  }
  const art:Art={scene,tier:'seed'};bases.set(model,art);return art;
}
export function fleetArt(model:string,tier:FleetDetail):Art|undefined{
  if(!isModel(model))return;
  const order= tier==='near' ? ['near','medium','far'] as const : tier==='medium' ? ['medium','near','far'] as const : ['far','medium','near'] as const;
  for(const candidate of order){
    const ready=entries.get(key(model,candidate))?.art;
    if(ready)return ready;
  }
  return baseArt(model);
}
