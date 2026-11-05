import { Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import { InstancedMesh, MathUtils, Mesh, Object3D } from "three";
import type { LayoutObject } from "../document/layoutDocument";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { streetProp } from "./streetPropCatalog";

const kit = "/models/roads/Downtown_Roadworks.glb";
function usePropMesh(piece:string) {
  const {nodes} = useGLTF(streetProp(piece)?.source??kit, '/draco/');
  const mesh = nodes[streetProp(piece)!.node];
  if (!(mesh instanceof Mesh)) throw Error("Missing street prop: " + piece);
  return mesh;
}

function PropBatch({items,onSelect}:{items:LayoutObject[];onSelect?:(id:string)=>void}) {
  const source=usePropMesh(items[0].piece), ref=useRef<InstancedMesh>(null);
  useLayoutEffect(()=>{
    const mesh=ref.current!;
    const pose=new Object3D();
    items.forEach((item,index)=>{
      pose.position.fromArray(item.position);
      pose.rotation.y=MathUtils.degToRad(item.yaw);
      pose.scale.fromArray(item.size);
      pose.updateMatrix();
      mesh.setMatrixAt(index,pose.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
  },[items]);
  const tip=streetProp(items[0].piece)?.tip;
  return <><instancedMesh ref={ref} args={[source.geometry,source.material,items.length]}
    onClick={onSelect ? e=>{if(e.button===0 && e.delta<5 && e.instanceId!==undefined){e.stopPropagation();onSelect(items[e.instanceId].id);}} : undefined}/>{tip && <LampFaces items={items} tip={tip}/>}</>;
}

function LampFaces({items,tip}:{items:LayoutObject[];tip:number[]}) {
  const ref=useRef<InstancedMesh>(null);
  useLayoutEffect(()=>{
    const mesh=ref.current;if(!mesh)return;
    const pose=new Object3D();
    items.forEach((o,i)=>{
      const a=o.yaw*Math.PI/180,x=tip[0]*o.size[0],z=tip[2]*o.size[2];
      pose.position.set(o.position[0]+Math.cos(a)*x+Math.sin(a)*z,o.position[1]+tip[1]*o.size[1],o.position[2]-Math.sin(a)*x+Math.cos(a)*z);
      pose.rotation.y=a;pose.updateMatrix();mesh.setMatrixAt(i,pose.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
  },[items,tip]);
  return <instancedMesh ref={ref} args={[undefined,undefined,items.length]}>
    <boxGeometry args={[.36,.065,.58]}/><meshBasicMaterial color="#ffe6ab" toneMapped={false}/>
  </instancedMesh>;
}

export function StreetPropInstances({objects,onSelect,fallback}:{objects:LayoutObject[];onSelect?:(id:string)=>void;fallback:ReactNode}) {
  const groups=useMemo(()=>{
    const byPiece=new Map<string,LayoutObject[]>();
    for(const item of objects){
      const items=byPiece.get(item.piece);
      if(items)items.push(item);else byPiece.set(item.piece,[item]);
    }
    return [...byPiece.values()];
  },[objects]);
  if(!groups.length)return null;
  return <AssetBoundary fallback={fallback}><Suspense fallback={fallback}>
    {groups.map(items=><PropBatch key={items[0].piece} items={items} onSelect={onSelect}/>)}
  </Suspense></AssetBoundary>;
}
function Single({piece}:{piece:string}) {
  const mesh=usePropMesh(piece);
  return <mesh geometry={mesh.geometry} material={mesh.material} dispose={null}/>;
}
export function StreetPropPreview({piece,fallback}:{piece:string;fallback:ReactNode}) {
  return <AssetBoundary fallback={fallback}><Suspense fallback={fallback}><Single piece={piece}/></Suspense></AssetBoundary>;
}
