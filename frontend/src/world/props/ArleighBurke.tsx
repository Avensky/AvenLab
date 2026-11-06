import {Detailed,useGLTF} from "@react-three/drei";
import {Suspense,useMemo} from "react";
import {AssetBoundary} from "../../components/debugger/AssetBoundary";
import {burkeKeelY,burkeSize} from "../../worldBuilder/generation/burkeDeck";

const paths=["/models/fleet/burke-lod0.glb","/models/fleet/burke-lod1.glb"] as const;

function Hull({path}:{path:string}){
  // useGLTF caches the source. Clone nodes per docked ship so two teams can
  // display the same asset without reparenting one shared scene object.
  const {scene}=useGLTF(path);
  const clone=useMemo(()=>scene.clone(true),[scene]);
  return <primitive object={clone} dispose={null}/>;
}

function Model(){
  return <group position={[0,-burkeKeelY/burkeSize[1],0]} rotation={[0,Math.PI,0]}
    scale={[1/burkeSize[0],1/burkeSize[1],1/burkeSize[2]]}>
    <Detailed distances={[0,220]}>
      <Hull path={paths[0]}/>
      <Hull path={paths[1]}/>
    </Detailed>
  </group>;
}

/** World Builder owns the size and yaw; the inner normalization matches the
 * measured local collision parts. Bow faces local -Z, keel is local y=0.
 */
export function ArleighBurke({fallback=null}:{fallback?:React.ReactNode}){
  return <AssetBoundary fallback={fallback}>
    <Suspense fallback={fallback}><Model/></Suspense>
  </AssetBoundary>;
}
