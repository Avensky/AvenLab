import {Html} from '@react-three/drei';
import {useFrame} from '@react-three/fiber';
import {memo,useMemo,useRef} from 'react';
import type {Group,MeshBasicMaterial} from 'three';
import {useVehiclePhysicsInterpolator} from '../../hooks/usePhysicsInterpolator';
import {useNetworkStore,type CtfFlag} from '../../store/session/networkStore';
import {minimapContacts} from '../../ui/Minimap/minimapContacts';
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
 const root=useRef<Group>(null),bob=useRef<Group>(null);
 const {getInterpolated}=useVehiclePhysicsInterpolator(carrier);
 useFrame(({clock})=>{
  const group=root.current,offset=bob.current;
  if(!group||!offset)return;
  const pose=getInterpolated(carrier);
  group.visible=pose!==null;
  if(pose)updateCarriedFlagPose(group,offset,pose,clock.elapsedTime);
 },-2);
 return <group ref={root} name={`carried-flag-${carrier}`} visible={false}>
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
export function CtfFlagMarkers(){
 const flagsKey=useNetworkStore(s=>JSON.stringify(s.snapshot?.match_state?.flags.map(flag=>({...flag,position:flag.status==='carried'?flag.base:flag.position}))??[]));
 const visibleKey=useNetworkStore(s=>JSON.stringify([s.playerId,...minimapContacts(s.snapshot,s.playerId).map(contact=>contact.id)]));
 const captureKey=useNetworkStore(s=>{
  const match=s.snapshot?.match_state,objective=match?getCtfCaptureObjective(match,s.getMe()??undefined):null;
  return objective?`${objective.team}:${objective.state}`:'';
 });
 const flags=useMemo(()=>JSON.parse(flagsKey) as CtfFlag[],[flagsKey]);
 const visibleCarriers=useMemo(()=>new Set(JSON.parse(visibleKey) as string[]),[visibleKey]);
 return <group name="ctf-flag-markers">{flags.map(flag=>{
  const color=flag.team==='red'?MATCH_TEAM_COLORS.red.glow:'#4bc9ff';
  return <group key={flag.team}>
   <BaseZone flag={flag} color={color} captureState={captureKey.startsWith(flag.team+':')?captureKey.slice(flag.team.length+1):''}/>
   {flag.status==='carried' ? flag.carrier&&visibleCarriers.has(flag.carrier)&&<CarriedFlag carrier={flag.carrier} color={color}/> : <group position={[flag.position[0],flag.position[1]+1.1,flag.position[2]]}>
    <FlagArtwork color={color}/>
    <Html position={[0,2.8,0]} center distanceFactor={65} style={{pointerEvents:'none',color,whiteSpace:'nowrap',font:'bold 11px system-ui',textShadow:'0 1px 3px #000'}}>{flag.team.toUpperCase()} FLAG · {flag.status.toUpperCase()}</Html>
   </group>}
  </group>;
 })}</group>;
}
