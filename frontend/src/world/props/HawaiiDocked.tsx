import {vehicleModelUrl} from '../../vehicles/assetCatalog.ts';
import {Suspense} from 'react';
import {AssetBoundary} from '../../components/debugger/AssetBoundary';
import {StaticFleetHull} from './StaticFleetHull';

function Model(){
  // Parent World Builder transform uses real hull size [24,26,154]. This
  // normalizes the original FBX units, keeping static and playable art equal.
  return <group position={[0,.52,0]} scale={[1/2,1/2.11,1/4.99]}>
    <StaticFleetHull near={vehicleModelUrl('hawaii-rescue')}/>
  </group>;
}
export function HawaiiDocked({fallback=null}:{fallback?:React.ReactNode}){
  return <AssetBoundary fallback={fallback}><Suspense fallback={fallback}><Model/></Suspense></AssetBoundary>;
}
