import {RecoveryCountdown} from './RecoveryCountdown';
import {recoveryStatus,healthMarkerIds} from './recoveryStatus';
import {usePreferencesStore} from "../store/preferences/preferencesStore";
import {showVehicleHealthBar} from "../store/preferences/healthVisibility";
import {Html} from '@react-three/drei';
import {useFrame} from '@react-three/fiber';
import {memo,useMemo,useRef} from 'react';
import {Group,Raycaster,Vector3} from 'three';
import {useShallow} from 'zustand/react/shallow';
import {useVehiclePhysicsInterpolator} from '../hooks/usePhysicsInterpolator';
import {useNetworkStore} from '../store/session/networkStore';
import {useUIStore} from '../store/menus/uiStore';
import './vehicleHealthMarkers.css';

const MAX_MARKER_DISTANCE=120;
const LOS_INTERVAL_MS=100;

/** Snapshot health belongs to React; interpolated movement only touches the
 * scene group and DOM visibility. Markers never capture steering/aim pointers. */
const VehicleHealthMarker=memo(function VehicleHealthMarker({id}:{id:string}){
 const root=useRef<Group>(null),card=useRef<HTMLDivElement>(null),projected=useRef(new Vector3());
 const ray=useRef(new Raycaster()),rayOrigin=useRef(new Vector3()),rayDirection=useRef(new Vector3()),worldPosition=useRef(new Vector3());
 const occluded=useRef(true),nextCheck=useRef(-1);
 const losPhase=useMemo(()=>{let hash=0;for(let i=0;i<id.length;i++)hash=(hash*31+id.charCodeAt(i))%LOS_INTERVAL_MS;return hash;},[id]);
 const {getInterpolated}=useVehiclePhysicsInterpolator(id);
 const mode=usePreferencesStore(s=>s.healthBars);
 const data=useNetworkStore(useShallow(s=>{
  const entity=s.snapshot?.entities.find(e=>e.id===id),health=entity?.health;
  const max=health&&Number.isFinite(health.max_hp)&&health.max_hp>0?health.max_hp:0;
  const hp=max&&Number.isFinite(health?.hp)?Math.max(0,Math.min(max,health!.hp)):0;
  const local=s.getMe(),localTeam=local?.team,team=entity?.team;
  return {max,hp,focused:local?.combat?.assisted_target===id,remaining:Math.ceil(Math.max(0,health?.respawn_remaining_s??0)*10)/10,window:health?.recovery_window_s,reason:health?.disabled_reason,showHp:showVehicleHealthBar(mode,team,id===s.playerId),defeated:health?.defeated===true,protected:(health?.spawn_protection_s??0)>0,
   relation:team&&localTeam?(team===localTeam?'ally':'enemy'):'neutral',
   label:entity?.vehicle_id==='tank'?'VANGUARD':entity?.vehicle_id?.replaceAll('_',' ').toUpperCase()??'VEHICLE',
   height:entity?.vehicle_id==='tank'?3.2:Math.max(1.15,(entity?.collider?.chassis_half_extents[1]??.5)+(entity?.collider?.chassis_offset[1]??0)+.7)};
 }));
 useFrame(({camera,scene})=>{
  const group=root.current,node=card.current;if(!group||!node)return;
  const network=useNetworkStore.getState(),pose=getInterpolated(id),received=network.snapshot?.received_at_ms;
  if(!pose||!network.connected||(received!==undefined&&performance.now()-received>1000)){
   node.style.visibility='hidden';return;
  }
  group.position.set(pose.position[0],pose.position[1]+data.height,pose.position[2]);
  group.getWorldPosition(worldPosition.current);camera.getWorldPosition(rayOrigin.current);
  const distance=worldPosition.current.distanceTo(rayOrigin.current);
  projected.current.copy(worldPosition.current).project(camera);
  const visible=distance<=MAX_MARKER_DISTANCE&&projected.current.z>=-1&&projected.current.z<=1;
  if(visible){
   // Recheck stationary targets too: destruction can change LOS without a pose
   // update. Stagger the bounded roster rather than raycasting every frame.
   const now=performance.now();if(nextCheck.current<0)nextCheck.current=now+losPhase;
   if(now>=nextCheck.current){
    nextCheck.current=now+LOS_INTERVAL_MS;
    rayDirection.current.copy(worldPosition.current).sub(rayOrigin.current).normalize();
    ray.current.set(rayOrigin.current,rayDirection.current);ray.current.near=.01;ray.current.far=Math.max(.01,distance-.35);ray.current.layers.mask=camera.layers.mask;
    occluded.current=false;
    for(const hit of ray.current.intersectObjects(scene.children,true)){
     let object:typeof hit.object|null=hit.object,visibleHit=true;
     while(object){if(!object.visible){visibleHit=false;break;}object=object.parent;}
     if(visibleHit){occluded.current=true;break;}
    }
   }
  }
  node.style.visibility=visible&&!occluded.current?'visible':'hidden';
  if(data.focused){const me=network.getMe();if(me){const meters=Math.round(Math.hypot(...pose.position.map((v,i)=>v-me.position[i])));node.dataset.range=meters+' M';}}
  node.style.opacity=String(data.defeated ? .95 : Math.min(1,Math.max(0,(MAX_MARKER_DISTANCE-distance)/25)));
 });
 if(data.max===0)return null;
 const status=recoveryStatus({defeated:data.defeated,respawn_remaining_s:data.remaining,recovery_window_s:data.window,disabled_reason:data.reason});
 const label=data.focused?'ASSIST':data.defeated?data.reason==='fuel'?'FUEL EMPTY':status?.revivable?'AWAITING MECHANIC':'DEFEATED':data.protected?'SPAWN SHIELD':data.relation.toUpperCase();
 return <group ref={root} name={`vehicle-health-marker-${id}`}>
  <Html center zIndexRange={[4,0]} style={{pointerEvents:'none'}}>
   <div ref={card} className="vehicle-health-marker" data-focused={data.focused} data-relation={data.relation} data-defeated={data.defeated} data-protected={!data.defeated&&data.protected}>
    {status&&<RecoveryCountdown status={status}/>}
    {data.showHp&&<><div className="vehicle-health-marker-title"><strong>{data.label}</strong><span>{label}</span></div>
    <div className="vehicle-health-marker-track" role="progressbar" aria-label={`${data.label} health`} aria-valuemin={0} aria-valuemax={data.max} aria-valuenow={data.hp}>
     <span style={{width:`${100*data.hp/data.max}%`}}/>
    </div>
    <small>{Math.ceil(data.hp)} / {Math.ceil(data.max)}</small></>}
    {status&&<small className="vehicle-recovery-marker-label">{label}</small>}
   </div>
  </Html>
 </group>;
});

/** Roster membership is a stable scalar, so ordinary pose snapshots do not
 * rebuild ten marker components. Local HP belongs to the driving HUD instead. */
export function VehicleHealthMarkers(){
 const mode=usePreferencesStore(s=>s.healthBars);
 const visible=useUIStore(s=>s.screen==='sandbox'&&s.overlay===null&&!s.isModeLoading);
 const roster=useNetworkStore(s=>JSON.stringify(s.connected&&s.playerId?healthMarkerIds(s.snapshot,s.playerId,mode):[]));
 const ids=useMemo(()=>JSON.parse(roster) as string[],[roster]);
 if(!visible)return null;
 return <group name="remote-vehicle-health-markers">{ids.map(id=><VehicleHealthMarker key={id} id={id}/>)}</group>;
}
