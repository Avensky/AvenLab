import { useMotionView } from "../store/session/networkViews";
import {publishSightCue} from './sightCue';
import {useSocialStore} from '../store/social/socialStore';
import {isMechanicPlayer} from './reviveTargets';
import {nearestHealPackTarget} from './healPackTargets';
import {projectAssistFrame,sightedTarget,MARKER_RANGE} from './assistFrame';
import {RecoveryCountdown} from './RecoveryCountdown';
import {recoveryStatus,healthMarkerIds} from './recoveryStatus';
import {usePreferencesStore} from "../store/preferences/preferencesStore";
import {showVehicleHealthBar} from "../store/preferences/healthVisibility";
import {Html} from '@react-three/drei';
import {useFrame} from '@react-three/fiber';
import {memo,useEffect,useMemo,useRef} from 'react';
import {Group,Raycaster,Vector3,type Intersection} from 'three';
import {useShallow} from 'zustand/react/shallow';
import {useVehiclePhysicsInterpolator} from '../hooks/usePhysicsInterpolator';
import {snapshotEntity, useNetworkStore} from '../store/session/networkStore';
import {useUIStore} from '../store/menus/uiStore';
import './vehicleHealthMarkers.css';

import {useScoreboardVisible} from '../game/stats/useScoreboardVisible';
import {MarkerSightBudget,hasSightBlocker} from './markerSight';


const LOS_INTERVAL_MS=100;

/** Snapshot health belongs to React; interpolated movement only touches the
 * scene group and DOM visibility. Markers never capture steering/aim pointers. */
const VehicleHealthMarker=memo(function VehicleHealthMarker({id,budget,focused,healing}:{id:string;budget:MarkerSightBudget;focused:boolean;healing:boolean}){
 const root=useRef<Group>(null),card=useRef<HTMLDivElement>(null),projected=useRef(new Vector3());
 const ray=useRef(new Raycaster()),rayOrigin=useRef(new Vector3()),rayDirection=useRef(new Vector3()),worldPosition=useRef(new Vector3());
 const occluded=useRef(true),nextCheck=useRef(-1);
 const hits=useRef<Intersection[]>([]),brackets=useRef<HTMLElement>(null),distanceText=useRef<HTMLElement>(null);
 const nextRange=useRef(0);
 const modern=usePreferencesStore(s=>s.hudGroups.futuristic);
 useEffect(()=>()=>budget.forget(id),[id,budget]);
 useEffect(()=>()=>{if(focused)publishSightCue(id,null);},[id,focused]);
 const {getInterpolated}=useVehiclePhysicsInterpolator(id);
 const mode=usePreferencesStore(s=>s.healthBars);
 const data=useMotionView(useShallow(s=>{
  const entity=snapshotEntity(s.snapshot, id),health=entity?.health;
  const max=health&&Number.isFinite(health.max_hp)&&health.max_hp>0?health.max_hp:0;
  const hp=max&&Number.isFinite(health?.hp)?Math.max(0,Math.min(max,health!.hp)):0;
  const local=s.getMe(),localTeam=local?.team,team=entity?.team;
  return {max,hp,assisted:local?.combat?.assisted_target===id,remaining:Math.ceil(Math.max(0,health?.respawn_remaining_s??0)*10)/10,window:health?.recovery_window_s,reason:health?.disabled_reason,showHp:showVehicleHealthBar(mode,team,id===s.playerId),defeated:health?.defeated===true,protected:(health?.spawn_protection_s??0)>0,
   relation:team&&localTeam?(team===localTeam?'ally':'enemy'):'neutral',
   label:entity?.vehicle_id==='tank'?'VANGUARD':entity?.vehicle_id?.replaceAll('_',' ').toUpperCase()??'VEHICLE',
   height:entity?.vehicle_id==='tank'?3.2:Math.max(1.15,(entity?.collider?.chassis_half_extents[1]??.5)+(entity?.collider?.chassis_offset[1]??0)+.7)};
 }));
 useFrame(({camera,scene,size})=>{
  const group=root.current,node=card.current;if(!group||!node){budget.forget(id);if(focused)publishSightCue(id,null);return;}
  const network=useNetworkStore.getState(),pose=getInterpolated(id),received=network.snapshot?.received_at_ms;
  if(!pose||!network.connected||(received!==undefined&&performance.now()-received>1000)){
   budget.forget(id);occluded.current=true;node.style.visibility='hidden';if(focused)publishSightCue(id,null);return;
  }
  group.position.set(pose.position[0],pose.position[1]+data.height,pose.position[2]);
  group.getWorldPosition(worldPosition.current);camera.getWorldPosition(rayOrigin.current);
  const distance=worldPosition.current.distanceTo(rayOrigin.current);
  projected.current.copy(worldPosition.current).project(camera);
  const visible=distance<=MARKER_RANGE && Math.abs(projected.current.x)<=1.05 && Math.abs(projected.current.y)<=1.05 && Math.abs(projected.current.z)<=1;
  if(visible){
   // Recheck stationary targets too: destruction can change LOS without a pose
   // update. Stagger the bounded roster rather than raycasting every frame.
   const now=performance.now();
   if(now>=nextCheck.current && budget.claim(id,now)){
    nextCheck.current=now+LOS_INTERVAL_MS;
    rayDirection.current.copy(worldPosition.current).sub(rayOrigin.current).normalize();
    ray.current.set(rayOrigin.current,rayDirection.current);ray.current.near=.01;ray.current.far=Math.max(.01,distance-.35);ray.current.layers.mask=camera.layers.mask;
    ray.current.camera=camera;
    occluded.current=hasSightBlocker(scene,ray.current,hits.current);
   }
  } else { budget.forget(id);occluded.current=true; }
  const shown=visible&&!occluded.current;
  if(focused)publishSightCue(id,shown&&!data.defeated?(healing?'heal':data.relation==='enemy'?'attack':data.relation==='ally'?'ally':null):null);
  const visibility=shown?'visible':'hidden';
  if(node.style.visibility!==visibility)node.style.visibility=visibility;
  if(!shown)return;
  if((modern||focused)&&performance.now()>=nextRange.current){
   nextRange.current=performance.now()+150;
   const me=network.getMe();
   if(me){
    const meters=Math.round(Math.hypot(pose.position[0]-me.position[0],pose.position[1]-me.position[1],pose.position[2]-me.position[2]));
    const range=meters+' m';
    if(node.dataset.range!==range)node.dataset.range=range;
    if(distanceText.current&&distanceText.current.textContent!==range)distanceText.current.textContent=range;
   }
  }
  if(brackets.current){
   const bounds=projectAssistFrame(pose,camera,projected.current,size.width,size.height);
   const frame=brackets.current;
   if(frame.hidden!==!bounds)frame.hidden=!bounds;
   if(bounds){
    const labelTop=(bounds.top-4)+'px';
    if(node.style.getPropertyValue('--contact-top')!==labelTop)node.style.setProperty('--contact-top',labelTop);
    const offset=`translate(${bounds.left}px, ${bounds.top}px)`;
    if(frame.style.transform!==offset)frame.style.transform=offset;
    if(frame.style.width!==bounds.width+'px')frame.style.width=bounds.width+'px';
    if(frame.style.height!==bounds.height+'px')frame.style.height=bounds.height+'px';
   }
  }
  const opacity=String(data.defeated ? .95 : Math.round(25*Math.min(1,Math.max(0,(MARKER_RANGE-distance)/25)))/25);
  if(node.style.opacity!==opacity)node.style.opacity=opacity;
 });
 if(data.max===0)return null;
 const status=recoveryStatus({defeated:data.defeated,respawn_remaining_s:data.remaining,recovery_window_s:data.window,disabled_reason:data.reason});
 const cue=healing?'+ HEAL':data.relation==='ally'?'ALLY':data.assisted?'ATTACK ASSIST':'ATTACK';
 const label=focused?cue:data.defeated?data.reason==='fuel'?'FUEL EMPTY':status?.revivable?'AWAITING MECHANIC':'DEFEATED':data.protected?'SPAWN SHIELD':data.relation.toUpperCase();
 return <group ref={root} name={`vehicle-health-marker-${id}`}>
  <Html center zIndexRange={[4,0]} style={{pointerEvents:'none'}}>
   <div ref={card} className="vehicle-health-marker" data-modern={modern} data-show-hp={data.showHp} data-focused={focused} data-healing={healing} data-relation={data.relation} data-defeated={data.defeated} data-protected={!data.defeated&&data.protected}>
    {status&&<RecoveryCountdown status={status}/>}
    {focused&&!data.defeated&&<i ref={brackets} hidden className="assist-target-frame" role="img" aria-label={cue}/>}
    {modern&&data.showHp&&<div className="contact-info">
      <div className="contact-tag" title={data.label}>
        <i aria-hidden="true"/><b>{data.relation.toUpperCase()}</b><span>·</span><em ref={distanceText}>— m</em>
        {focused&&<strong>{cue}</strong>}
      </div>
      <div className="contact-health">
        <span className="contact-name">{data.protected?'SHIELD':data.label}</span>
        <small>{Math.ceil(data.hp)}/{Math.ceil(data.max)}</small>
        <div className="vehicle-health-marker-track" role="progressbar" aria-label={data.label+' health'} aria-valuemin={0} aria-valuemax={data.max} aria-valuenow={data.hp}>
          <span style={{width:`${100*data.hp/data.max}%`}}/>
        </div>
      </div>
    </div>}
    {!modern&&data.showHp&&<><div className="vehicle-health-marker-title"><strong>{data.label}</strong><span>{label}</span></div>
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
 const covered=useScoreboardVisible();
 const budget=useMemo(()=>new MarkerSightBudget(),[]);
 const visible=useUIStore(s=>s.screen==='sandbox'&&s.overlay===null&&!s.isModeLoading);
 const modern=usePreferencesStore(s=>s.hudGroups.futuristic);
 const social=useSocialStore(s=>s.view?.alpha?.active);
 const healingTarget=useMotionView(s=>visible&&!covered&&social?.hero==='mechanic'&&isMechanicPlayer(s)?nearestHealPackTarget(s.snapshot,s.playerId)?.id??null:null);
 const target=useMotionView(s=>healingTarget??(visible&&!covered&&s.connected?(modern?sightedTarget(s.snapshot,s.getMe()):s.getMe()?.combat?.assisted_target??null):null));
 const ids=useMotionView(useShallow(s=>visible&&!covered&&s.connected&&s.playerId?healthMarkerIds(s.snapshot,s.playerId,mode,target):[]));
 if(!visible||covered)return null;
 return <group name="remote-vehicle-health-markers">{ids.map(id=><VehicleHealthMarker key={id} id={id} budget={budget} focused={target===id} healing={healingTarget===id}/>)}</group>;
}
