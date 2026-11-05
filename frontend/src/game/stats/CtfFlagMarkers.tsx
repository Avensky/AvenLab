import { useMotionView, type MotionState } from "../../store/session/networkViews";
import {Html} from '@react-three/drei';
import {useFrame} from '@react-three/fiber';
import {memo,useMemo,useRef} from 'react';
import type {Group,MeshBasicMaterial} from 'three';
import {useVehiclePhysicsInterpolator} from '../../hooks/usePhysicsInterpolator';
import {useNetworkStore,type CtfFlag} from '../../store/session/networkStore';
import {visibleCarrier} from '../../ui/Minimap/minimapContacts';
import {CARRIED_FLAG_SCALE,CARRIED_FLAG_ROTATION,updateCarriedFlagPose} from './carriedFlagVisual';
import {getCtfCaptureObjective} from './ctfObjective';
import {CtfFlagCloth} from './CtfFlagCloth';
import {MATCH_TEAM_COLORS} from '../../theme/matchTeamTheme';

function FlagArtwork({color,carried=false}:{color:string;carried?:boolean}){
 return <>
  <mesh position={[0,1.2,0]}><cylinderGeometry args={[.045,.045,2.4,6]}/><meshBasicMaterial color="#e8edf3"/></mesh>
  <CtfFlagCloth color={color} carried={carried}/>
 </>;
}

/** Share the exact chassis render timeline instead of moving this attachment
 * from raw flag snapshots. The small bob is cosmetic and frame-clock driven. */
const CarriedFlag=memo(function CarriedFlag({carrier,color}:{carrier:string;color:string}){
 const root=useRef<Group>(null),bob=useRef<Group>(null),marker=useRef<HTMLSpanElement>(null);
 const nextLabel=useRef(0);
 const {getInterpolated}=useVehiclePhysicsInterpolator(carrier);
 useFrame(({clock})=>{
  const group=root.current,offset=bob.current;
  if(!group||!offset)return;
  const pose=getInterpolated(carrier);
  group.visible=pose!==null;
  if(pose)updateCarriedFlagPose(group,offset,pose,clock.elapsedTime);
  if(marker.current && clock.elapsedTime>=nextLabel.current){
   nextLabel.current=clock.elapsedTime+.2;
   const me=useNetworkStore.getState().getMe();
   const distance=me&&pose?Math.round(Math.hypot(pose.position[0]-me.position[0],pose.position[1]-me.position[1],pose.position[2]-me.position[2])):0;
   const hidden=distance<40;
   if(marker.current.hidden!==hidden)marker.current.hidden=hidden;
   if(!hidden){
    const text='⚑ '+distance+' m';
    if(marker.current.textContent!==text)marker.current.textContent=text;
   }
  }
 },-2);
 return <group ref={root} name={`carried-flag-${carrier}`} visible={false}>
  <Html center position={[0,4.5,0]} zIndexRange={[3,0]} style={{pointerEvents:'none'}}>
   <span ref={marker} hidden className="carrier-range" style={{borderColor:color}}/>
  </Html>
  <group ref={bob} position={[0,1.1,0]} scale={CARRIED_FLAG_SCALE} rotation={[0,CARRIED_FLAG_ROTATION,0]}><FlagArtwork color={color} carried/></group>
 </group>;
});

function BaseZone({flag,color,captureState}:{flag:CtfFlag;color:string;captureState:string}){
 const material=useRef<MeshBasicMaterial>(null);
 const active=captureState!==''&&captureState!=='warmup';
 const tint=active?(captureState==='blocked'?'#ffca66':'#82ffc4'):color;
 useFrame(({clock})=>{
  if(material.current)material.current.opacity=active ? .72+.2*Math.sin(clock.elapsedTime*3) : .65;
 });
 return <mesh name={`ctf-base-${flag.team}`} userData={{captureState}} position={[flag.base[0],flag.base[1]-.6,flag.base[2]]} rotation={[-Math.PI/2,0,0]}>
  <ringGeometry args={[2.6,3,48]}/><meshBasicMaterial ref={material} color={tint} transparent opacity={.65} depthWrite={false}/>
 </mesh>;
}

/** Authored base/drop positions are authoritative. Carried flags follow the
 * rendered vehicle; neither a mesh nor a label sends pickup/capture requests. */
function markerSelector() {
 let rows: CtfFlag[] = [];
 const samePoint=(a:number[],b:number[])=>a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2];
 return (state:MotionState) => {
  const flags=state.snapshot?.match_state?.flags;
  if(!flags?.length){if(rows.length) rows=[];return rows;}
  let next=rows;
  for(let i=0;i<flags.length;i++){
   const flag=flags[i], old=rows[i];
   const carried=flag.status==='carried';
   const position=carried?flag.base:flag.position;
   const carrier=carried && visibleCarrier(state.snapshot,state.playerId,flag.carrier)?flag.carrier:null;
   const remaining=Math.ceil(flag.return_remaining_s??0);
   if(old && old.team===flag.team && old.status===flag.status && old.carrier===carrier &&
      old.return_remaining_s===remaining && samePoint(old.base,flag.base) && samePoint(old.position,position))continue;
   if(next===rows)next=rows.slice();
   next[i]={...flag,carrier,position,return_remaining_s:remaining};
  }
  if(next.length!==flags.length)next=next.slice(0,flags.length);
  return rows=next;
 };
}
export function CtfFlagMarkers(){
 const selectFlags=useMemo(markerSelector,[]);
 const flags=useMotionView(selectFlags);
 const captureKey=useMotionView(s=>{
  const match=s.snapshot?.match_state,objective=match?getCtfCaptureObjective(match,s.getMe()??undefined):null;
  return objective?`${objective.team}:${objective.state}`:'';
 });
 return <group name="ctf-flag-markers">{flags.map(flag=>{
  const color=flag.team==='red'?MATCH_TEAM_COLORS.red.glow:'#4bc9ff';
  return <group key={flag.team}>
   <BaseZone flag={flag} color={color} captureState={captureKey.startsWith(flag.team+':')?captureKey.slice(flag.team.length+1):''}/>
   {flag.status==='carried' ? flag.carrier&&<CarriedFlag carrier={flag.carrier} color={color}/> : <group position={[flag.position[0],flag.position[1]+1.1,flag.position[2]]}>
    <FlagArtwork color={color}/>
    <Html position={[0,2.8,0]} center distanceFactor={65} style={{pointerEvents:'none',color,whiteSpace:'nowrap',font:'bold 11px system-ui',textShadow:'0 1px 3px #000'}}>{flag.team.toUpperCase()} FLAG · {flag.status.toUpperCase()}{flag.status==='dropped' && flag.return_remaining_s>0 ? ` · ${flag.return_remaining_s}s` : ''}</Html>
   </group>}
  </group>;
 })}</group>;
}
