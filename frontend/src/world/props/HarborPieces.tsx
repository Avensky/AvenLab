import {useGLTF} from "@react-three/drei";
import {useFrame} from "@react-three/fiber";
import {Suspense,useRef} from "react";
import {Mesh,type Group} from "three";
import {AssetBoundary} from "../../components/debugger/AssetBoundary";
import {useNetworkStore} from "../../store/session/networkStore";
import type {LayoutObject} from "../../worldBuilder/document/layoutDocument";

function FlightDeck(){
  const {scene}=useGLTF("/models/world/big-e-docked.glb");
  const source=scene.children[0] as Mesh;
  return <mesh geometry={source.geometry} material={source.material} dispose={null} receiveShadow/>;
}
export function BigEDocked({fallback=null}:{fallback?:React.ReactNode}){
  return <AssetBoundary fallback={fallback}><Suspense fallback={fallback}><FlightDeck/></Suspense></AssetBoundary>;
}

// Both peers evaluate the same hinge angle from the server simulation tick.
export function leafAngle(tick:number){
  const wave=Math.max(0,Math.sin(2*Math.PI*(tick%1200)/1200));
  return wave*wave*Math.PI/6;
}
export function BridgeLeaf({item,wireframe}:{item:LayoutObject,wireframe:boolean}){
  const hinge=useRef<Group>(null);
  useFrame(()=>{
    const snapshot=useNetworkStore.getState().snapshot;
    if(!hinge.current || !snapshot)return;
    const age=Math.min(50,Math.max(0,performance.now()-(snapshot.received_at_ms??performance.now())));
    hinge.current.rotation.z=leafAngle(snapshot.tick+age*.06);
  });
  return <group position={item.position} rotation={[0,item.yaw*Math.PI/180,0]}>
    <group ref={hinge}><mesh position={[item.size[0]/2,-item.size[1]/2,0]} scale={item.size}>
      <boxGeometry/><meshStandardMaterial color={item.color} wireframe={wireframe}/>
    </mesh></group>
  </group>;
}
