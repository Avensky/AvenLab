import {Suspense,useLayoutEffect,useMemo,useRef} from 'react';
import {Color,InstancedMesh,Object3D} from 'three';
import {CityChunk} from '../world/CityChunk';
import {cityTextureAsset} from '../world/cityLod';
import {AssetBoundary} from '../components/debugger/AssetBoundary';
import {editableBoxes,type MapDocument} from './mapDocument';
import {useEditorPreferences} from './editorPreferences';

function ReferenceBoxes({source}:{source:MapDocument}){
 const boxes=useMemo(()=>editableBoxes(source),[source]),mesh=useRef<InstancedMesh>(null);
 useLayoutEffect(()=>{
  if(!mesh.current)return;const object=new Object3D(),color=new Color();
  boxes.forEach((box,i)=>{object.position.fromArray(box.center);object.scale.set(...box.half.map(n=>n*2) as [number,number,number]);object.updateMatrix();mesh.current!.setMatrixAt(i,object.matrix);mesh.current!.setColorAt(i,color.set(box.collection==='roads'?'#26394d':'#435e77'));});
  mesh.current.instanceMatrix.needsUpdate=true;if(mesh.current.instanceColor)mesh.current.instanceColor.needsUpdate=true;mesh.current.computeBoundingSphere();
 },[boxes]);
 return boxes.length?<instancedMesh name="installed-world-reference" key={boxes.length} ref={mesh} args={[undefined,undefined,boxes.length]} raycast={()=>{}}><boxGeometry/><meshStandardMaterial roughness={1}/></instancedMesh>:null;
}
export function WorldReference({source,full}:{source:MapDocument;full:boolean}){
 const detail=useEditorPreferences(s=>s.detail),proxy=<ReferenceBoxes source={source}/>;
 if(!full||detail==='low')return proxy;
 return <AssetBoundary key={source.map_id} fallback={proxy}><Suspense fallback={proxy}>{source.visuals.map(visual=><CityChunk key={visual.id} path={cityTextureAsset(visual.asset,detail==='high'?'original':'fast')} position={visual.position} quaternion={visual.rotation} scale={visual.scale}/>)}</Suspense></AssetBoundary>;
}
