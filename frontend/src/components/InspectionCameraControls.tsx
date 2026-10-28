import {OrbitControls} from '@react-three/drei';
import {useFrame,useThree} from '@react-three/fiber';
import {useRef} from 'react';
import {Vector3} from 'three';
import type {OrbitControls as Orbit} from 'three-stdlib';
import {useVehiclePhysicsInterpolator} from '../hooks/usePhysicsInterpolator';
export function InspectionCameraControls({playerId,enabled}:{playerId:string;enabled:boolean}){
 const {camera}=useThree(),controls=useRef<Orbit|null>(null),last=useRef(new Vector3()),offset=useRef(new Vector3()),delta=useRef(new Vector3()),initialized=useRef(false),{getInterpolated}=useVehiclePhysicsInterpolator(playerId);
 useFrame(()=>{const pose=getInterpolated(playerId),orbit=controls.current;if(!pose||!orbit)return;offset.current.fromArray(pose.position);if(!initialized.current){camera.position.copy(offset.current).add(new Vector3(6,3,-7));initialized.current=true;}else camera.position.add(delta.current.copy(offset.current).sub(last.current));last.current.copy(offset.current);orbit.target.copy(offset.current);orbit.target.y+=.4;},-2);
 return <OrbitControls ref={controls} makeDefault enabled={enabled} minDistance={1} maxDistance={35} enablePan enableZoom/>;
}
