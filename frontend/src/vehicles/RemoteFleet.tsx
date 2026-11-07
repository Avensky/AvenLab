import {writeInstanceMatrix as writeMatrix} from './writeInstanceMatrix';
import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {useFrame} from '@react-three/fiber';
import {fleetArt,fleetArtVersion,retainFleetArt,subscribeFleetArt} from './fleetAssets';
import {Color,Frustum,Group,InstancedMesh,Matrix4,Mesh,MeshPhysicalMaterial,MeshStandardMaterial,Object3D,Quaternion,Sphere,Vector3} from 'three';
import {useFleetPoseReader} from '../hooks/usePhysicsInterpolator';
import {snapshotEntity,useNetworkStore} from '../store/session/networkStore';
import {useRenderSettingsStore} from '../store/presentation/renderSettingsStore';
import {useCombatStore} from '../combat/combatStore';
import {worldAim} from '../combat/turretPresentation';
import {vehicleAsset} from '../worldBuilder/vehicles/vehicleCatalog';
import {fleetDetail,type FleetDetail} from './fleetDetail';
import type {RosterEntity} from './rosterSelector';

type Finish='factory'|'frs'|'soft';
const finishOf=(value:unknown):Finish=>value==='factory'||value==='soft'?value:'frs';
const metallicOf=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):.42;
const unit=new Vector3(1,1,1);
const hidden=new Matrix4().makeScale(0,0,0);
const up=new Vector3(0,1,0),axle=new Vector3(1,0,0);
type BatchProps={model:string;tier:FleetDetail|'seed';cars:RosterEntity[];scene:Group;finish?:Finish;metallic?:number};
function FleetBatch({model,tier,cars,scene,finish='frs',metallic=.42}:BatchProps){
  const paintMaterials=useMemo(()=>scene.children.map(source=>{
    if(!(source instanceof Mesh)||source.name!=='paint')return null;
    const material=(source.material as MeshStandardMaterial).clone();
    material.color.set(0xffffff);
    material.roughness=finish==='factory'?Math.max(material.roughness,.24):finish==='frs'?.28:Math.max(.44,material.roughness);
    material.metalness=metallic*.82;
    if(material instanceof MeshPhysicalMaterial){material.clearcoat=Math.min(.18,.05+metallic*.13);material.clearcoatRoughness=material.roughness;material.specularIntensity=Math.min(1,material.specularIntensity);}
    return material;
  }),[scene,finish,metallic]);
  useEffect(()=>()=>paintMaterials.forEach(material=>material?.dispose()),[paintMaterials]);
  const parts=useMemo(()=>scene.children.filter((m):m is Mesh=>m instanceof Mesh),[scene]);
  const meshes=useRef<(InstancedMesh|null)[]>([]);
  const turret=useMemo(()=>parts.find(part=>part.name==='turret'),[parts]);
  const getInterpolated=useFleetPoseReader();
  const scratch=useMemo(()=>({vehicle:new Object3D(),part:new Object3D(),base:new Matrix4(),matrix:new Matrix4(),
    aim:new Vector3(),inverse:new Quaternion(),yaw:new Quaternion(),pivot:new Vector3(),color:new Color(),oldColor:new Color(),dirty:[] as boolean[],paintDirty:false}),[]);
  useFrame(()=>{
    const s=scratch,network=useNetworkStore.getState();
    s.dirty.fill(false);s.paintDirty=false;
    for(const [i,car] of cars.entries()){
      const pose=getInterpolated(car.id),c=pose?.combat;
      if(pose){
        s.vehicle.position.fromArray(pose.position);s.vehicle.quaternion.fromArray(pose.rotation);
        const shape=car.collider;
        s.pivot.set(0,(shape?.nominal_wheel_center_y??0)-(shape?.wheel_radius??.33),0).applyQuaternion(s.vehicle.quaternion);
        s.vehicle.position.add(s.pivot);s.vehicle.updateMatrix();
        s.aim.set(0,0,1);
        if(c?.role==='tank'){
          if(c.hull_locked && c.lock_yaw!==undefined){
            const pitch=c.lock_pitch??0;
            s.aim.set(Math.sin(c.lock_yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(c.lock_yaw)*Math.cos(pitch));
          } else {
            worldAim(s.aim,c.yaw,c.pitch).applyQuaternion(s.inverse.copy(s.vehicle.quaternion).invert());
          }
        }
      }
      const paint=snapshotEntity(network.snapshot,car.id)?.appearance?.body;
      for(const [j,source] of parts.entries()){
        const batch=meshes.current[j];if(!batch)continue;
        let transform=hidden;
        if(pose){
          transform=s.vehicle.matrix;
          if(turret && (source.name==='turret'||source.name==='cannon')){
            s.yaw.setFromAxisAngle(up,Math.atan2(s.aim.x,s.aim.z));
            s.base.compose(turret.position,s.yaw,unit);
            s.matrix.multiplyMatrices(transform,s.base);
            if(source.name==='cannon'){
              s.part.position.copy(source.position).sub(turret.position);
              s.part.quaternion.setFromAxisAngle(axle,-Math.atan2(s.aim.y,Math.hypot(s.aim.x,s.aim.z)));
              s.part.updateMatrix();s.matrix.multiply(s.part.matrix);
            }
            transform=s.matrix;
          }
        }
        if(writeMatrix(batch,i,transform))s.dirty[j]=true;
        if(source.name==='paint'){
          if(paint && /^#[0-9a-f]{6}$/i.test(paint))s.color.set(paint);else s.color.copy((source.material as MeshStandardMaterial).color);
          if(batch.instanceColor)batch.getColorAt(i,s.oldColor);
          if(!batch.instanceColor||s.oldColor.r!==Math.fround(s.color.r)||s.oldColor.g!==Math.fround(s.color.g)||s.oldColor.b!==Math.fround(s.color.b)){batch.setColorAt(i,s.color);s.paintDirty=true;}
        }
      }
    }
    meshes.current.forEach((batch,j)=>{if(!batch)return;batch.count=cars.length;if(s.dirty[j])batch.instanceMatrix.needsUpdate=true;
      if(parts[j].name==='paint'&&s.paintDirty&&batch.instanceColor)batch.instanceColor.needsUpdate=true;});
  });
  return <group name={`fleet-${model}-${tier}`}>{parts.map((p,j)=><instancedMesh key={p.uuid} ref={m=>{meshes.current[j]=m;}}
    name={`${model}-${tier}-${p.name}`} args={[p.geometry,paintMaterials[j]??p.material,cars.length]} count={0} frustumCulled={false}/>)}</group>;
}

/** Used on cold deployment or if a full local rig fails to load. */
export function VehicleExterior({entity}:{entity:RosterEntity}){
  const model=entity.vehicle_id??'';
  useSyncExternalStore(subscribeFleetArt,fleetArtVersion,fleetArtVersion);
  useEffect(()=>retainFleetArt(model,'medium'),[model]);
  const finish=useNetworkStore(s=>finishOf(snapshotEntity(s.snapshot,entity.id)?.appearance?.finish));
  const metallic=useNetworkStore(s=>metallicOf(snapshotEntity(s.snapshot,entity.id)?.appearance?.metallic));
  const art=fleetArt(model,'medium');
  return art?<FleetBatch model={model} cars={[entity]} finish={finish} metallic={metallic} {...art}/>:null;
}

export function RemoteFleet({cars}:{cars:RosterEntity[]}){
  const low=useRenderSettingsStore(s=>s.lowDetail),scoped=useCombatStore(s=>s.scope);
  const [levels,setLevels]=useState(()=>new Map<string,FleetDetail>());
  const previous=useRef(levels),next=useRef(-1);
  const scratch=useMemo(()=>({point:new Vector3(),local:new Vector3(),sphere:new Sphere(),frustum:new Frustum(),matrix:new Matrix4()}),[]);
  const version=useSyncExternalStore(subscribeFleetArt,fleetArtVersion,fleetArtVersion);
  useFrame(({camera,clock,size})=>{
    if(clock.elapsedTime<next.current)return;
    next.current=clock.elapsedTime+.10;
    const network=useNetworkStore.getState(),chosen=new Map<string,FleetDetail>();
    const {point,sphere,frustum,matrix,local}=scratch;
    const me=network.getMe();
    if(me)local.fromArray(me.position);
    frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    for(const car of cars){
      const pose=snapshotEntity(network.snapshot,car.id),asset=vehicleAsset(car.vehicle_id??'');
      if(!pose||!asset)continue;
      point.fromArray(pose.position);
      const distance=me?point.distanceTo(local):point.distanceTo(camera.position);
      // Include body extents and movement between 10 Hz visibility checks.
      sphere.center.copy(point);sphere.radius=Math.hypot(...asset.size)*.5+4;
      const visible=frustum.intersectsSphere(sphere);
      point.applyMatrix4(camera.matrixWorldInverse);
      const depth=-point.z,perspective=camera.projectionMatrix.elements[15]===0;
      const pixels=asset.size[1]*size.height*.5*camera.projectionMatrix.elements[5]/(perspective?Math.max(.01,depth):1);
      point.applyMatrix4(camera.projectionMatrix);
      const level=fleetDetail({pixels,distance,visible,center:Math.hypot(point.x,point.y)},previous.current.get(car.id),low,scoped);
      if(level)chosen.set(car.id,level);
    }
    if(chosen.size!==previous.current.size || [...chosen].some(([id,tier])=>previous.current.get(id)!==tier)){
      previous.current=chosen;setLevels(chosen);
    }
  });
  useEffect(()=>{
    const releases=cars.flatMap(car=>{
      const tier=levels.get(car.id);
      return tier?[retainFleetArt(car.vehicle_id??'',tier)]:[];
    });
    return ()=>releases.forEach(release=>release());
  },[cars,levels]);
  // A scalar selector changes only when a visible player's finish changes, not on every pose packet.
  const finishes=useNetworkStore(s=>cars.map(car=>`${finishOf(snapshotEntity(s.snapshot,car.id)?.appearance?.finish)}:${metallicOf(snapshotEntity(s.snapshot,car.id)?.appearance?.metallic)}`).join(','));
  const batches=useMemo(()=>{
    const batches=new Map<string,BatchProps>();
    for(const [index,car] of cars.entries()){
      const [finishValue,metalValue]=finishes.split(',')[index].split(':');
      const finish=finishOf(finishValue),metallic=metallicOf(Number(metalValue));
      const tier=levels.get(car.id),model=car.vehicle_id;
      if(!tier||!model)continue;
      const art=fleetArt(model,tier);
      if(!art)continue;
      const key=model+'-'+art.tier+'-'+finish+'-'+metallic;
      const group=batches.get(key)??{model,...art,finish,metallic,cars:[]};
      group.cars.push(car);batches.set(key,group);
    }
    return [...batches];
  },[cars,levels,version,finishes]);
  return <>{batches.map(([key,batch])=><FleetBatch key={key} {...batch}/>)}</>;
}
