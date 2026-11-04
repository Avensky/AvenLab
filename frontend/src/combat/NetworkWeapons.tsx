import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Quaternion, Vector3 } from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useVehiclePhysicsInterpolator } from '../hooks/usePhysicsInterpolator';
import { useNetworkStore } from '../store/session/networkStore';
import { NetworkCombatEffects } from './NetworkCombatEffects';
import { placeRoofTurret } from './turretPresentation';

export function NetworkWeapons() {
  const ids=useNetworkStore(useShallow(state => {
    const room=state.getMe()?.room_id ?? state.room_id;
    return state.connected ? (state.snapshot?.entities ?? [])
      .filter(e => (room===null || room===e.room_id) && e.combat?.enabled && e.vehicle_id!=='tank')
      .map(e => e.id).sort() : [];
  }));
  return <><NetworkCombatEffects />{ids.map(id => <Turret key={id} id={id} />)}</>;
}

const Turret=memo(function Turret({id}:{id:string}) {
  const mount=useRef<Group>(null),pivot=useRef<Group>(null),gun=useRef<Group>(null);
  const scratch=useMemo(()=>({direction:new Vector3(),inverse:new Quaternion()}),[]);
  const {getInterpolated}=useVehiclePhysicsInterpolator(id);
  const role=useNetworkStore(s=>s.snapshot?.entities.find(e=>e.id===id)?.combat?.role);
  useFrame(()=>{
    if (!mount.current || !pivot.current || !gun.current) return;
    const pose=getInterpolated(id), combat=pose?.combat;
    mount.current.visible=!!combat?.enabled;
    if (pose && combat?.enabled)
      placeRoofTurret(mount.current,pivot.current,gun.current,pose,combat,scratch.direction,scratch.inverse);
  });
  return <group ref={mount} name={`roof-turret-${id}`} visible={false}>
    <group ref={pivot}>
      <mesh><boxGeometry args={[.65,.18,.65]}/><meshStandardMaterial color="#475464"/></mesh>
      <group ref={gun}>{(role==='assault'?[-.24,.24]:[0]).map(x=>
        <mesh key={x} position={[x,.12,-.55]}><boxGeometry args={[.1,.12,1.15]}/><meshStandardMaterial color={role==='medic'?'#60bba2':'#252e38'}/></mesh>
      )}</group>
    </group>
  </group>;
});
