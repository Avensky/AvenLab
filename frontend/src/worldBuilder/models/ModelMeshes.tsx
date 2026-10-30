import {Suspense,useMemo,useRef,useState} from 'react';
import {useFrame,useLoader} from '@react-three/fiber';
import {BufferGeometry,DoubleSide,Float32BufferAttribute,Group,Matrix4,Mesh,Vector3,type Material,type Object3D} from 'three';
import {useEditorPreferences} from '../editorPreferences';
import {useRenderSettingsStore} from '../../store/renderSettingsStore';
import {AssetBoundary} from '../../components/debugger/AssetBoundary';
import {prepareGarageDisplay} from '../../game/preview/prepareGarageDisplay';
import {GarageGLTFLoader} from './garageLoader';
import {modelAsset,modelSolid,modelVisible,type ModelAsset} from './modelCatalog';
import {garageRole,isGarageModule,type ModelRole} from './modelRoles';
import type {LayoutObject} from '../layoutDocument';
type Draw={role:ModelRole;geometry:BufferGeometry;material:Material};
const visualCache=new WeakMap<Object3D,Draw[]>(),collisionCache=new Map<string,{role:'floor'|'walls'|'roof';geometry:BufferGeometry}[]>();
function modelDraws(scene:Object3D,a:ModelAsset):Draw[]{
 const cached=visualCache.get(scene);if(cached)return cached;
 const display=prepareGarageDisplay(scene);display.root.updateMatrixWorld(true);const out:Draw[]=[];
 const normalize=new Matrix4().makeScale(...a.size.map(v=>1/v) as [number,number,number]).multiply(new Matrix4().makeTranslation(-a.origin[0],-a.origin[1],-a.origin[2])).multiply(new Matrix4().makeScale(a.source_scale,a.source_scale,a.source_scale));
 display.root.traverseVisible(node=>{
  if(!(node instanceof Mesh))return;let name=String(node.userData.name??node.name);for(let owner:Object3D|null=node;owner;owner=owner.parent){const candidate=String(owner.userData.name??owner.name);if(isGarageModule(candidate)){name=candidate;break;}}const g=node.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(normalize,node.matrixWorld)),p=g.getAttribute('position'),materials=Array.isArray(node.material)?node.material:[node.material];
  const groups=g.groups.length?g.groups:[{start:0,count:g.index?.count??p.count,materialIndex:0}];
  // Only the two mixed shell meshes need per-triangle classification. The
  // 460k-triangle decorative model stays on the fast whole-primitive path.
  const key=name.replace(/[^a-zA-Z0-9]/g,'').toLowerCase(),uniform=key==='basefull'||key==='basesol'?null:garageRole(name,0,0);
  for(const group of groups){
   if(uniform!==null){if(uniform!=='omit'){const geometry=g.clone();geometry.clearGroups();const indices=g.index?Array.from(g.index.array).slice(group.start,group.start+group.count):Array.from({length:group.count},(_,i)=>group.start+i);geometry.setIndex(indices);geometry.computeBoundingSphere();out.push({role:uniform,geometry,material:materials[group.materialIndex??0]});}continue;}
   const byRole=new Map<ModelRole,number[]>();for(let i=group.start;i<group.start+group.count;i+=3){const tri=[0,1,2].map(k=>g.index?g.index.getX(i+k):i+k),v=tri.map(k=>new Vector3(p.getX(k)*a.size[0]+a.origin[0],p.getY(k)*a.size[1]+a.origin[1],p.getZ(k)*a.size[2]+a.origin[2])),normal=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize(),role=garageRole(name,v.reduce((n,p)=>n+p.y,0)/3,normal.y);if(role==='omit')continue;const list=byRole.get(role)??[];list.push(...tri);byRole.set(role,list);}
   for(const[role,indices]of byRole){const geometry=g.clone();geometry.clearGroups();geometry.setIndex(indices);geometry.computeBoundingSphere();out.push({role,geometry,material:materials[group.materialIndex??0]});}
  }g.dispose();
 });visualCache.set(scene,out);return out;
}
function collisionDraws(a:ModelAsset){let cached=collisionCache.get(a.id);if(cached)return cached;cached=a.colliders.map(c=>{const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(c.vertices.flatMap(v=>v.map((n,i)=>n/a.size[i])),3));geometry.setIndex(c.indices.flat());geometry.computeVertexNormals();return {role:c.role,geometry};});collisionCache.set(a.id,cached);return cached;}
function GarageVisual({item,ghost}:{item:LayoutObject;ghost:boolean}){
 const a=modelAsset(item.model!.asset)!,gltf=useLoader(GarageGLTFLoader,a.lods[0].url),draws=useMemo(()=>modelDraws(gltf.scene,a),[gltf.scene,a]);
 return <group dispose={null}>{draws.filter(d=>modelVisible(d.role,item.model!)).map((d,i)=><mesh key={i} name={`prefab-visual-${d.role}`} geometry={d.geometry} material={ghost?undefined:d.material} receiveShadow>
  {ghost&&<meshStandardMaterial color="#67c5ff" transparent opacity={.4} depthWrite={false} side={DoubleSide}/>}
 </mesh>)}</group>;
}
export function ModelCollision({item,wireframe=true,ghost=false}:{item:LayoutObject;wireframe?:boolean;ghost?:boolean}){
 if(!item.solid)return null;const a=modelAsset(item.model!.asset)!;
 return <group dispose={null}>{collisionDraws(a).filter(d=>modelSolid(d.role,item.model!)).map(d=><mesh key={d.role} name={`prefab-collision-${d.role}`} geometry={d.geometry}>
  <meshStandardMaterial color={d.role==='floor'?'#55caff':'#4ce2b0'} side={DoubleSide} wireframe={wireframe} depthTest={!wireframe} transparent={ghost} opacity={ghost?.4:1}/>
 </mesh>)}</group>;
}
function ModelProxy({item,ghost=false}:{item:LayoutObject;ghost?:boolean}){
 const a=modelAsset(item.model!.asset)!;
 return <group name="garage-structural-lod" dispose={null}>{collisionDraws(a).filter(d=>item.model!.visible[d.role]).map(d=><mesh key={d.role} geometry={d.geometry}><meshStandardMaterial color={d.role==='floor'?'#42546a':'#8396a7'} side={DoubleSide} transparent={ghost} opacity={ghost?.4:1}/></mesh>)}</group>;
}
export function ModelMesh({item,ghost=false,wireframe=false,collisionOnly=false,proxy=false}:{item:LayoutObject;ghost?:boolean;wireframe?:boolean;collisionOnly?:boolean;proxy?:boolean}){
 if(collisionOnly)return <ModelCollision item={item} wireframe={wireframe} ghost={ghost}/>;
 if(proxy||ghost)return <ModelProxy item={item} ghost={ghost}/>;
 return <AssetBoundary fallback={<ModelProxy item={item}/>}><Suspense fallback={<ModelProxy item={item}/>}><GarageVisual item={item} ghost={ghost}/></Suspense></AssetBoundary>;
}
export function ModelInstances({objects,exclude,onSelect,wireframe,collisionOnly}:{objects:LayoutObject[];exclude:string|null;wireframe:boolean;collisionOnly:boolean;onSelect?:(id:string)=>void}){
 const root=useRef<Group>(null),frame=useRef(0),point=useMemo(()=>new Vector3(),[]),[full,setFull]=useState<string[]>([]),detail=useEditorPreferences(s=>s.detail),quality=useRenderSettingsStore(s=>s.cityQuality);
 const items=useMemo(()=>objects.filter(o=>o.model&&o.id!==exclude),[objects,exclude]);
 useFrame(({camera})=>{
  if(!root.current||collisionOnly||frame.current++%15)return;
  const local=root.current.worldToLocal(camera.getWorldPosition(point)),range=detail==='high'?250:135,limit=detail==='low'?0:detail==='high'?6:quality==='fast'?1:2;
  const next=items.map(o=>({id:o.id,distance:local.distanceTo(new Vector3(...o.position))})).filter(o=>o.distance<range*(full.includes(o.id)?1.25:1)).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id)).slice(0,limit).map(o=>o.id);
  if(next.join('|')!==full.join('|'))setFull(next);
 });
 return <group ref={root}>{items.map(item=><group key={item.id} name={`prefab-${item.id}`} position={item.position} rotation={[0,item.yaw*Math.PI/180,0]} scale={item.size} onClick={onSelect?e=>{if(e.button===0&&e.delta<5){e.stopPropagation();onSelect(item.id);}}:undefined}><ModelMesh item={item} wireframe={wireframe} collisionOnly={collisionOnly} proxy={!full.includes(item.id)}/></group>)}</group>;
}
