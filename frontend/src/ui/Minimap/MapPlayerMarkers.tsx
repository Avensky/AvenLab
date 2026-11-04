import {useEffect,useState} from 'react';
import {useNetworkStore} from '../../store/session/networkStore';
import {MAP_UPDATE_HZ} from '../../store/telemetry/mapTelemetry';
import {minimapContacts,localCarriedFlag,projectMinimapContact,MINIMAP_ALLY_COLOR,MINIMAP_ENEMY_COLOR} from './minimapContacts';

function readContacts(){
 const network=useNetworkStore.getState(),me=network.getMe();
 if(!network.connected||(network.room_id!==null&&me?.room_id!==network.room_id))return {contacts:[],selfFlag:undefined};
 return {contacts:minimapContacts(network.snapshot,network.playerId),selfFlag:localCarriedFlag(network.snapshot,network.playerId)};
}

/** Only this small layer observes snapshots. Project at the map's display rate,
 * keeping raw network updates away from road geometry and route searches. */
export function MapPlayerMarkers({x,z,range,circular}:{x:number;z:number;range:number;circular:boolean}){
 const [markers,setMarkers]=useState(readContacts);
 useEffect(()=>{
  let last=-Infinity;
  return useNetworkStore.subscribe((state,previous)=>{
   const identityChanged=state.playerId!==previous.playerId||state.connected!==previous.connected||state.room_id!==previous.room_id||state.snapshot===null||!state.snapshot.entities.some(entity=>entity.id===state.playerId);
   if(!identityChanged&&state.snapshot===previous.snapshot)return;
   const now=performance.now();
   if(!identityChanged&&now-last<1000/MAP_UPDATE_HZ)return;
   last=now;
   const next=readContacts();
   setMarkers(current=>JSON.stringify(current)===JSON.stringify(next)?current:next);
  });
 },[]);
 return <g className="map-player-contacts" pointerEvents="none" aria-label="Team radio contacts">{markers.selfFlag&&<CarrierRing id="self" x={x} z={z} range={range} self flag={markers.selfFlag}/>} {markers.contacts.map(contact=>{
  const point=projectMinimapContact(contact,x,z,range,circular);
  if(!point)return null;
  return <g key={contact.id}>{contact.carryingFlag&&<CarrierRing id={contact.id} x={point.x} z={point.z} range={range} flag={contact.carryingFlag}/>}<circle data-player-id={contact.id} data-side={contact.side} data-edge={point.edge} data-defeated={contact.defeated} data-flag-carrier={Boolean(contact.carryingFlag)} cx={point.x} cy={point.z} r={range/80} fill={contact.side==='ally'?MINIMAP_ALLY_COLOR:MINIMAP_ENEMY_COLOR} stroke="#061019" strokeWidth={range/300} opacity={contact.defeated?0.45:1} aria-label={contact.side==='ally'?contact.defeated?'Defeated teammate':'Teammate':'Detected enemy'}><title>{contact.side==='ally'?'Teammate':'Detected enemy'}{point.edge?' · beyond map edge':''}</title></circle></g>;
 })}</g>;
}

/** Keep relationship colours on the dot; gold identifies the carried objective. */
function CarrierRing({id,x,z,range,self=false,flag}:{id:string;x:number;z:number;range:number;self?:boolean;flag:'red'|'blue'}){
 const scale=range/600,radius=range/(self?24:44);
 return <g className="map-flag-carrier" data-carrier-id={id} data-self-carrier={self} data-carried-flag={flag} aria-label={self?'You carry the flag':'Flag carrier'}>
  <circle cx={x} cy={z} r={radius} fill="none" stroke="#ffe28c" strokeWidth={range/210} style={{filter:'drop-shadow(0 0 3px #ffe28c)'}}/>
  <path d="M-3 -10v-12m0 0h10v7H-3" transform={`translate(${x} ${z}) scale(${scale})`} fill="#ffe28c" stroke="#ffe28c" strokeWidth="1.5" strokeLinejoin="round"/>
 </g>;
}
