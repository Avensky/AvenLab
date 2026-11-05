import {useGLTF} from '@react-three/drei';
import {useLayoutEffect} from 'react';
import type {Group, Mesh} from 'three';

// The GLB is split at the sample's trunnion. Only the gun pitches; the tripod
// stays on the roof and uses the same chassis pose as the server muzzle.
export function BrowningModel({stand,gun}:{stand:Group;gun:Group}) {
  const {nodes}=useGLTF('/models/world/m2-browning.glb');
  useLayoutEffect(()=>{
    const tripod=(nodes.Tripod as Mesh).clone(), barrel=(nodes.M2 as Mesh).clone();
    stand.add(tripod);
    gun.add(barrel);
    return ()=>{stand.remove(tripod); gun.remove(barrel);};
  },[nodes,stand,gun]);
  return null;
}
