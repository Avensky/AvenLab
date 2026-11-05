import {writeInstanceMatrix} from '../vehicles/writeInstanceMatrix';
import { useMotionView } from "../store/session/networkViews";
import { memo, Suspense, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useVehiclePhysicsInterpolator } from '../hooks/usePhysicsInterpolator';
import {snapshotEntity} from '../store/session/networkStore';
import { NetworkCombatEffects } from './NetworkCombatEffects';
import {BrowningModel} from './BrowningModel';
import { placeRoofTurret } from './turretPresentation';

// Instances share GPU geometry/materials. Dimensions distinguish the mounts
// without creating additional renderers or changing authoritative shot origins.
const cube=new BoxGeometry(1,1,1);
const baseSteel=new MeshStandardMaterial({color:'#4d555b',metalness:.35,roughness:.68});
const gunSteel=new MeshStandardMaterial({color:'#343b40',metalness:.42,roughness:.6});
type RoofKit={width:number;length:number;bore:number;twin?:boolean};
const roofKits:Record<string,RoofKit>={
 ae86:{width:.53,length:.86,bore:.09},brz:{width:.61,length:1,bore:.09,twin:true},
 camaro:{width:.64,length:1.08,bore:.13},supra:{width:.55,length:1.17,bore:.095},
 mini:{width:.46,length:.72,bore:.085},sierra:{width:.77,length:1.14,bore:.15},
 landcruiser:{width:.7,length:.93,bore:.12},fortuner:{width:.61,length:.66,bore:.18},
 cx30:{width:.58,length:.55,bore:.14,twin:true},
};
export function NetworkWeapons() {
  const ids=useMotionView(useShallow(state => {
    const room=state.getMe()?.room_id ?? state.room_id;
    return state.connected ? (state.snapshot?.entities ?? [])
      .filter(e => (room===null || room===e.room_id) && e.combat && e.vehicle_id!=='tank')
      .map(e => e.id).sort() : [];
  }));
  const bases=useRef<InstancedMesh>(null),barrels=useRef<InstancedMesh>(null);
  const dirty=useRef({bases:false,barrels:false});
  const capacity=Math.max(10,ids.length);
  useFrame(()=>{
    if(!bases.current||!barrels.current)return;
    bases.current.count=ids.length;barrels.current.count=ids.length*2;
    if(dirty.current.bases)bases.current.instanceMatrix.needsUpdate=true;
    if(dirty.current.barrels)barrels.current.instanceMatrix.needsUpdate=true;
    dirty.current.bases=dirty.current.barrels=false;
  });
  return <><NetworkCombatEffects/>
    <instancedMesh ref={bases} name="roof-turret-bases" args={[cube,baseSteel,capacity]} count={0} frustumCulled={false}/>
    <instancedMesh ref={barrels} name="roof-turret-barrels" args={[cube,gunSteel,capacity*2]} count={0} frustumCulled={false}/>
    {ids.map((id,index)=><Turret key={id} id={id} index={index} bases={bases} barrels={barrels} dirty={dirty}/>)}</>;
}

const hidden=new Matrix4().makeScale(0,0,0);
type Batch=RefObject<InstancedMesh|null>;
const Turret=memo(function Turret({id,index,bases,barrels,dirty}:{id:string;index:number;bases:Batch;barrels:Batch;dirty:RefObject<{bases:boolean;barrels:boolean}>}){
  const chassis=useMotionView(s=>snapshotEntity(s.snapshot, id)?.vehicle_id);
  const role=useMotionView(s=>{
    const c=snapshotEntity(s.snapshot,id)?.combat;
    return c?.weapon==='spray' ? 'assault' : c?.role ?? 'assault';
  });
  const browning=role==='support';
  const rig=useMemo(()=>{
    const kit=roofKits[chassis??'']??roofKits.brz;
    const mount=new Group(),pivot=new Group(),gun=new Group(),base=new Object3D(),stand=new Group();
    mount.add(stand,pivot);pivot.add(base,gun);base.scale.set(kit.width,.18,kit.width*.88);
    if (browning) gun.position.y=.2532;
    const precision=role==='medic';
    const tubes=(!precision && kit.twin?[-.16,.16]:[0]).map(x=>{
      const tube=new Object3D();tube.scale.set(kit.bore,kit.bore,kit.length*(precision?1.35:1));
      tube.position.set(x,.1,-tube.scale.z/2);gun.add(tube);return tube;
    });
    return {mount,pivot,gun,stand,base,tubes,direction:new Vector3(),inverse:new Quaternion()};
  },[chassis,role,browning]);
  const {getInterpolated}=useVehiclePhysicsInterpolator(id);
  useFrame(()=>{
    if(!bases.current||!barrels.current)return;
    const pose=getInterpolated(id),c=pose?.combat;
    rig.mount.visible=Boolean(pose&&c);
    if(pose&&c){
      placeRoofTurret(rig.mount,rig.pivot,rig.gun,pose,c,rig.direction,rig.inverse);
      rig.stand.position.copy(rig.pivot.position);
      rig.mount.updateMatrixWorld();
    }
    if(writeInstanceMatrix(bases.current,index,c&&!browning?rig.base.matrixWorld:hidden))dirty.current.bases=true;
    if(writeInstanceMatrix(barrels.current,index*2,c&&!browning?rig.tubes[0].matrixWorld:hidden))dirty.current.barrels=true;
    if(writeInstanceMatrix(barrels.current,index*2+1,c&&!browning&&rig.tubes[1]?rig.tubes[1].matrixWorld:hidden))dirty.current.barrels=true;
  },-2);
  return browning ? <><primitive object={rig.mount} dispose={null}/>
    <Suspense fallback={null}><BrowningModel stand={rig.stand} gun={rig.gun}/></Suspense></> : null;
});
