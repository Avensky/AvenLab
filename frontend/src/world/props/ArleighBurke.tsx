import {vehicleLodUrl,vehicleModelUrl} from '../../vehicles/assetCatalog.ts';
import {Suspense} from "react";
import {AssetBoundary} from "../../components/debugger/AssetBoundary";
import {burkeKeelY,burkeSize} from "../../worldBuilder/generation/burkeDeck";
import {StaticFleetHull} from './StaticFleetHull';

const paths=[vehicleModelUrl('burke'),vehicleLodUrl('burke','medium')] as const;

function Model(){
  return <group position={[0,-burkeKeelY/burkeSize[1],0]} rotation={[0,Math.PI,0]}
    scale={[1/burkeSize[0],1/burkeSize[1],1/burkeSize[2]]}>
    <StaticFleetHull near={paths[0]} medium={paths[1]} originalDistance={360}/>
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
