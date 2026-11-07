import {Detailed,useGLTF} from '@react-three/drei';
import {useMemo} from 'react';
import {useRenderSettingsStore} from '../../store/presentation/renderSettingsStore';
import {cloneStaticHull,fleetDetailDistance} from './fleetHullPolicy';

function Hull({path}:{path:string}){
  const {scene}=useGLTF(path);
  const instance=useMemo(()=>cloneStaticHull(scene),[scene]);
  return <primitive object={instance} dispose={null}/>;
}

/** Shared renderer for unanimated docked hulls. Playable vessel articulation
 * stays in NavalVessel; do not freeze its turret/radar transforms here. */
export function StaticFleetHull({near,medium=near,originalDistance=360}:{
  near:string;medium?:string;originalDistance?:number;
}){
  const quality=useRenderSettingsStore(s=>s.cityQuality);
  const distance=fleetDetailDistance(quality,originalDistance);
  if(distance===null||near===medium)return <Hull path={medium}/>;
  return <Detailed distances={[0,distance]} hysteresis={.15}>
    <Hull path={near}/><Hull path={medium}/>
  </Detailed>;
}
