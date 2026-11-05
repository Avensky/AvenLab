import { useMotionView } from "../../store/session/networkViews";
import {useEffect,useState} from 'react';
import {snapshotEntity,useNetworkStore} from '../../store/session/networkStore';
import {MAP_UPDATE_HZ} from '../../store/telemetry/mapTelemetry';
import {minimapContacts,localCarriedFlag,projectMinimapContact,MINIMAP_ALLY_COLOR,MINIMAP_ENEMY_COLOR} from './minimapContacts';

function readContacts(){
 const network=useNetworkStore.getState(),me=network.getMe();
 if(!network.connected||(network.room_id!==null&&me?.room_id!==network.room_id))return {contacts:[],selfFlag:undefined};
 return {contacts:minimapContacts(network.snapshot,network.playerId),selfFlag:localCarriedFlag(network.snapshot,network.playerId)};
}

function sameMarkers(a:ReturnType<typeof readContacts>, b:ReturnType<typeof readContacts>){
 return a.selfFlag===b.selfFlag && a.contacts.length===b.contacts.length &&
  a.contacts.every((p,i)=>{
   const q=b.contacts[i];
   return p.id===q.id && p.x===q.x && p.z===q.z && p.side===q.side &&
    p.defeated===q.defeated && p.carryingFlag===q.carryingFlag;
  });
}

/** Only this small layer observes snapshots. Project at the map's display rate,
 * keeping raw network updates away from road geometry and route searches. */
export function MapPlayerMarkers({x,z,centerX=x,centerZ=z,range,circular}:{x:number;z:number;centerX?:number;centerZ?:number;range:number;circular:boolean}){
 const [markers,setMarkers]=useState(readContacts);
 useEffect(()=>{
  let last=-Infinity;
  return useMotionView.subscribe((state,previous)=>{
   const sessionChanged=state.playerId!==previous.playerId||state.connected!==previous.connected||state.room_id!==previous.room_id;
   if(!sessionChanged&&state.snapshot===previous.snapshot)return;
   const identityChanged=sessionChanged||!snapshotEntity(state.snapshot,state.playerId);
   const now=performance.now();
   if(!identityChanged&&now-last<1000/MAP_UPDATE_HZ)return;
   last=now;
   const next=readContacts();
   setMarkers(current=>sameMarkers(current,next)?current:next);
  });
 },[]);
 return <g className="map-player-contacts" pointerEvents="none" aria-label="Team radio contacts">{markers.selfFlag&&<CarrierRing id="self" x={x} z={z} range={range} self flag={markers.selfFlag}/>} {markers.contacts.map(contact=>{
  const point=projectMinimapContact(contact,centerX,centerZ,range,circular);
  if(!point)return null;
  return <g key={contact.id}>{contact.carryingFlag&&<CarrierRing id={contact.id} x={point.x} z={point.z} range={range} flag={contact.carryingFlag}/>}<circle data-player-id={contact.id} data-side={contact.side} data-edge={point.edge} data-defeated={contact.defeated} data-flag-carrier={Boolean(contact.carryingFlag)} cx={point.x} cy={point.z} r={range/80} fill={contact.side==='ally'?MINIMAP_ALLY_COLOR:MINIMAP_ENEMY_COLOR} stroke="#061019" strokeWidth={range/300} opacity={contact.defeated?0.45:1} aria-label={contact.side==='ally'?contact.defeated?'Defeated teammate':'Teammate':'Detected enemy'}><title>{contact.side==='ally'?'Teammate':'Detected enemy'}{point.edge?' · beyond map edge':''}</title></circle></g>;
 })}</g>;
}

/** Keep relationship colours on the dot; gold identifies the carried objective. */
function CarrierRing({id,x,z,range,self=false,flag}:{id:string;x:number;z:number;range:number;self?:boolean;flag:'red'|'blue'}){
 const radius=range/(self?24:44);
 return <g className="map-flag-carrier" data-carrier-id={id} data-self-carrier={self} data-carried-flag={flag} aria-label={self?'You carry the flag':'Flag carrier'}>
  <title>{self?'You carry':'Carries'} the {flag.toUpperCase()} flag</title>
  <circle className="map-carrier-ring" cx={x} cy={z} r={radius} fill="none" stroke="#ffe28c" strokeWidth={range/210} style={{filter:'drop-shadow(0 0 3px #ffe28c)'}}/>
  <circle cx={x} cy={z} r={radius+range/180} fill="none" stroke="#ffe28c" strokeWidth={range/600} opacity=".35"/>
 </g>;
}
