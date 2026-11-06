import {Detailed,useGLTF} from '@react-three/drei';
import {Suspense,useMemo} from 'react';
import {AssetBoundary} from '../../components/debugger/AssetBoundary';
import {LOUISIANA_SIZE} from '../../worldBuilder/generation/navalHullSpecs';

const paths=['/models/fleet/louisiana-lod0.glb','/models/fleet/louisiana-lod1.glb'];
function Hull({path}:{path:string}){
  const {scene}=useGLTF(path);
  const root=useMemo(()=>scene.clone(true),[scene]);
  return <primitive object={root} dispose={null}/>;
}
/** The saved GLB is already metric. The editor's outer group owns all 188 m
 * of length; only normalize to unit prefab coordinates in this component.
 * The source is ONE merged mesh, so its original turrets cannot rotate yet. */
function Model(){
  return <group scale={LOUISIANA_SIZE.map(n=>1/n) as [number,number,number]} rotation={[0,Math.PI,0]}>
    <Detailed distances={[0,430]}>
      <Hull path={paths[0]}/><Hull path={paths[1]}/>
    </Detailed>
  </group>;
}
export function LouisianaDocked({fallback=null}:{fallback?:React.ReactNode}){
  return <AssetBoundary fallback={fallback}><Suspense fallback={fallback}><Model/></Suspense></AssetBoundary>;
}
