import {Suspense, useMemo, useRef, useState} from 'react';
import {useFrame} from '@react-three/fiber';
import {useGLTF} from '@react-three/drei';
import {BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Matrix4, Mesh, Vector3, type Material, type Object3D} from 'three';
import {useRenderSettingsStore} from '../../store/renderSettingsStore';
import {AssetBoundary} from '../../components/debugger/AssetBoundary';
import {roadAsset, roleAt, roleSolid, roleVisible, type RoadAsset} from './roadCatalog';
import type {LayoutObject} from '../layoutDocument';
import type {Role} from '../roadKit/roadKitCore';

type Draw = {geometry: BufferGeometry; material: Material; role: Role};
const markingMaterials = new WeakMap<Material, Material>();
function displayMaterial(source: Material) {
  if(source.name!=='MarkingRoad')return source;
  let material=markingMaterials.get(source);
  if(!material){material=source.clone();material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-4;markingMaterials.set(source,material);}
  return material;
}
const cache = new WeakMap<Object3D, Draw[]>(), collisionCache = new Map<string, {role: Role; geometry: BufferGeometry}[]>();
function visualDraws(scene: Object3D, asset: RoadAsset): Draw[] {
  const cached = cache.get(scene); if (cached) return cached;
  scene.updateMatrixWorld(true);
  const normalization = new Matrix4().makeScale(...asset.size.map(v => 1/v) as [number,number,number])
    .multiply(new Matrix4().makeRotationY(asset.source_yaw)).multiply(new Matrix4().makeTranslation(-asset.origin[0],-asset.origin[1],-asset.origin[2]));
  const draws: Draw[] = [];
  scene.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const source = node.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(normalization, node.matrixWorld)), p = source.getAttribute('position'), materials: Material[] = Array.isArray(node.material) ? node.material : [node.material];
    const groups = source.groups.length ? source.groups : [{start: 0, count: source.index?.count ?? p.count, materialIndex: 0}];
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0], byRole = new Map<Role, number[]>();
      for (let i = group.start; i < group.start + group.count; i += 3) {
        const triangle = [0,1,2].map(k => source.index ? source.index.getX(i+k) : i+k);
        const x = triangle.reduce((n,v) => n+p.getX(v),0)/3, z = triangle.reduce((n,v) => n+p.getZ(v),0)/3;
        const role = roleAt(material.name, x, z, asset.id), indices = byRole.get(role) ?? [];
        indices.push(...triangle); byRole.set(role, indices);
      }
      for (const [role,indices] of byRole) {const geometry = source.clone(); geometry.clearGroups(); geometry.setIndex(indices); geometry.computeBoundingSphere(); draws.push({geometry,material:displayMaterial(material),role});}
    }
    source.dispose();
  });
  cache.set(scene, draws); return draws;
}
function collisionDraws(asset: RoadAsset) {
  let draws = collisionCache.get(asset.id); if (draws) return draws;
  draws = asset.colliders.map(c => {
    const geometry = new BufferGeometry(); geometry.setAttribute('position',new Float32BufferAttribute(c.vertices.flatMap(v=>v.map((n,i)=>n/asset.size[i])),3));
    geometry.setIndex(c.indices.flat()); geometry.computeVertexNormals(); return {role:c.role,geometry};
  });
  collisionCache.set(asset.id,draws); return draws;
}
// Bounded shared geometry: each of the nine source GLBs is parsed once, and
// every placement shares its geometry, textures and materials. No scene clones.
function RoadVisual({item,lod,ghost}: {item:LayoutObject;lod:number;ghost:boolean}) {
  const asset=roadAsset(item.road!.asset)!, gltf=useGLTF(asset.lods[lod].url), draws=useMemo(()=>visualDraws(gltf.scene,asset),[gltf.scene,asset]);
  return <group dispose={null}>{draws.filter(d=>roleVisible(d.role,item.road!.variant)).map((d,i)=><mesh key={i} name={`road-visual-${d.role}`} geometry={d.geometry} material={ghost?undefined:d.material} receiveShadow>
    {ghost&&<meshStandardMaterial color="#60e0bd" transparent opacity={.42} depthWrite={false} side={DoubleSide}/>}
  </mesh>)}</group>;
}
export function RoadCollision({item,wireframe=true,ghost=false}: {item:LayoutObject;wireframe?:boolean;ghost?:boolean}) {
  const asset=roadAsset(item.road!.asset)!;
  if(!item.solid)return null;
  return <group dispose={null}>{collisionDraws(asset).filter(d=>roleSolid(d.role,item.road!)).map(d=><mesh key={d.role} name={`road-collision-${d.role}`} geometry={d.geometry}>
    <meshStandardMaterial color={ghost?'#60e0bd':d.role==='surface'?'#58bdf5':'#50e5b2'} roughness={1} side={DoubleSide} wireframe={wireframe} depthTest={!wireframe} transparent opacity={ghost?.4:.95}/>
  </mesh>)}</group>;
}
export function RoadModel({item,collisionOnly=false,wireframe=false,ghost=false}: {item:LayoutObject;collisionOnly?:boolean;wireframe?:boolean;ghost?:boolean}) {
  const quality=useRenderSettingsStore(s=>s.cityQuality);
  const group=useRef<Group>(null),[autoLod,setAutoLod]=useState<number|null>(null),counter=useRef(0),center=useMemo(()=>new Vector3(),[]);
  useFrame(({camera})=>{
    if(item.road!.lod!=='auto'||collisionOnly||!group.current)return;
    if(autoLod!==null&&++counter.current%20)return;
    const distance=camera.position.distanceTo(group.current.getWorldPosition(center));
    const next=autoLod===null?(distance>420?2:distance>180?1:0):autoLod===0?(distance>180?1:0):autoLod===1?(distance<145?0:distance>420?2:1):distance<350?1:2;
    const chosen=quality==='fast'?Math.max(1,next):next;
    if(chosen!==autoLod)setAutoLod(chosen);
  });
  if(collisionOnly)return <RoadCollision item={item} wireframe={wireframe} ghost={ghost}/>;
  const lod=item.road!.lod==='auto'?autoLod:item.road!.lod;
  return <group ref={group}>{lod===null?<RoadCollision item={item} wireframe/>:<AssetBoundary key={`${item.road!.asset}-${lod}`} fallback={<RoadCollision item={item} wireframe/>}>
    <Suspense fallback={<RoadCollision item={item} wireframe/>}><RoadVisual item={item} lod={lod} ghost={ghost}/></Suspense>
  </AssetBoundary>}</group>;
}
export function RoadInstances({objects,exclude,collisionOnly,wireframe,onSelect}: {objects:LayoutObject[];exclude:string|null;collisionOnly:boolean;wireframe:boolean;onSelect?:(id:string)=>void}) {
  return <>{objects.filter(o=>o.road&&o.id!==exclude).map(item=><group key={item.id} name={`road-${item.id}`} position={item.position} rotation={[0,item.yaw*Math.PI/180,0]} scale={item.size} onClick={onSelect?e=>{if(e.button===0&&e.delta<5){e.stopPropagation();onSelect(item.id);}}:undefined}>
    <RoadModel item={item} collisionOnly={collisionOnly} wireframe={wireframe}/>
  </group>)}</>;
}
