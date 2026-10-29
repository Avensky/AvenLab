import {Suspense,useLayoutEffect,useMemo,useRef} from 'react';
import {Html,OrbitControls,PerspectiveCamera} from '@react-three/drei';
import {Color,InstancedMesh,Object3D} from 'three';
import {useBuilderStore} from './builderStore';
import {editableBoxes} from './mapDocument';
import {CityChunk} from '../world/CityChunk';
import {AssetBoundary} from '../components/debugger/AssetBoundary';

function BoxReference(){
 const doc=useBuilderStore(s=>s.doc),selected=useBuilderStore(s=>s.selected),mesh=useRef<InstancedMesh>(null),boxes=useMemo(()=>doc?editableBoxes(doc):[],[doc]);
 useLayoutEffect(()=>{if(!mesh.current)return;const transform=new Object3D(),color=new Color();boxes.forEach((box,i)=>{transform.position.fromArray(box.center);transform.scale.set(...box.half.map(n=>n*2) as [number,number,number]);transform.updateMatrix();mesh.current!.setMatrixAt(i,transform.matrix);mesh.current!.setColorAt(i,color.set(box.id===selected?'#ffba66':box.collection==='roads'?'#94a9b5':'#62d6f3'));});mesh.current.instanceMatrix.needsUpdate=true;if(mesh.current.instanceColor)mesh.current.instanceColor.needsUpdate=true;mesh.current.computeBoundingSphere();},[boxes,selected]);
 return boxes.length?<instancedMesh key={boxes.length} ref={mesh} args={[undefined,undefined,boxes.length]} renderOrder={10} onClick={e=>{if(e.button===0&&e.delta<6&&e.instanceId!==undefined){e.stopPropagation();useBuilderStore.getState().select(boxes[e.instanceId].id);}}}><boxGeometry/><meshBasicMaterial wireframe depthTest={false}/></instancedMesh>:null;
}
export default function WorldBuilderScene(){
 const doc=useBuilderStore(s=>s.doc),view=useBuilderStore(s=>s.view),preset=useBuilderStore(s=>s.preset),zoom=useBuilderStore(s=>s.zoom);
 if(!doc||view!=='3d')return null;
 const span=Math.max(...doc.cell),position:[number,number,number]=preset==='top'?[0,span*zoom,0]:[span*.8*zoom,span*.9*zoom,-span*.8*zoom];
 return <group name="world-builder-reference">
  <color attach="background" args={['#08121c']}/><hemisphereLight args={['#b8d6f1','#1f2937',1.3]}/><directionalLight position={[100,200,-80]} intensity={2}/>
  <PerspectiveCamera key={preset} makeDefault position={position} up={preset==='top'?[0,0,-1]:[0,1,0]} fov={50} near={.1} far={span*20}/>
  <OrbitControls key={preset} makeDefault target={[0,doc.surface.road_y,0]} enableRotate={preset!=='top'} minDistance={5} maxDistance={span*5}/>
  <gridHelper args={[Math.max(...doc.cell)*1.4,40,'#6b8498','#1f3547']} position={[0,doc.surface.road_y,0]}/>
  {doc.visuals.map(visual=><AssetBoundary key={visual.id} fallback={<Html center><span style={{background:'#10202c',color:'#ffc177',font:'11px monospace'}}>REFERENCE UNAVAILABLE: {visual.id}</span></Html>}><Suspense fallback={null}><CityChunk path={visual.asset} position={visual.position} quaternion={visual.rotation} scale={visual.scale}/></Suspense></AssetBoundary>)}
  <BoxReference/>
 </group>;
}
