import {vehicleLodUrl,vehicleModelUrl} from '../../vehicles/assetCatalog.ts';
import {Suspense} from 'react';
import {AssetBoundary} from '../../components/debugger/AssetBoundary';
import {LOUISIANA_SIZE} from '../../worldBuilder/generation/navalHullSpecs';
import {StaticFleetHull} from './StaticFleetHull';

const paths=[vehicleModelUrl('louisiana'),vehicleLodUrl('louisiana','medium')];
/** The saved GLB is already metric. The editor's outer group owns all 188 m
 * of length; only normalize to unit prefab coordinates in this component.
 * The source is ONE merged mesh, so its original turrets cannot rotate yet. */
function Model(){
  return <group scale={LOUISIANA_SIZE.map(n=>1/n) as [number,number,number]} rotation={[0,Math.PI,0]}>
    <StaticFleetHull near={paths[0]} medium={paths[1]} originalDistance={430}/>
  </group>;
}
export function LouisianaDocked({fallback=null}:{fallback?:React.ReactNode}){
  return <AssetBoundary fallback={fallback}><Suspense fallback={fallback}><Model/></Suspense></AssetBoundary>;
}
