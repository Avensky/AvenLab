import {memo,useEffect,useMemo,useState} from 'react';
import {useWorldStore} from '../store/worldStore';
import {useVehicleTelemetryStore,startVehicleTelemetry} from '../store/vehicleTelemetryStore';
import {useNavigationStore} from '../store/navigationStore';
import {usePreferencesStore} from '../store/preferencesStore';
import {buildRoadGraph,nearestRoad,roadRoute,pathDistance} from '../navigation/roadNavigation';
const RoadLayer=memo(function RoadLayer({roads}:{roads:ReturnType<typeof buildRoadGraph>['roads']}){return <>{roads.map((r,i)=><rect key={i} x={r.x-r.hx} y={r.z-r.hz} width={r.hx*2} height={r.hz*2} fill="#293e4b" stroke="#59717f" strokeWidth="1"/>)}</>;});
function MapContent(){
 useEffect(startVehicleTelemetry,[]);
 const map=useWorldStore(s=>s.map),x=useVehicleTelemetryStore(s=>s.data.positionX),z=useVehicleTelemetryStore(s=>s.data.positionZ),yaw=useVehicleTelemetryStore(s=>s.data.yawDeg),mile=usePreferencesStore(s=>s.speedUnit==='mph');
 const destination=useNavigationStore(s=>s.destination),set=useNavigationStore.getState().setDestination,[range,setRange]=useState(600),[notice,setNotice]=useState('');
 const graph=useMemo(()=>buildRoadGraph((map?.collider_chunks??[]).flatMap(chunk=>chunk.boxes)),[map]);
 const start=x!==null&&z!==null?nearestRoad(graph,{x,z}):null,end=destination?nearestRoad(graph,destination):null;
 const si=start?.index??-1,ei=end?.index??-1;
 const middle=useMemo(()=>roadRoute(graph,si,ei),[graph,si,ei]);
 const route=start&&end&&middle&&start.distance<=80&&end.distance<=80?[start.point,...middle,end.point]:null,metres=route?pathDistance(route):null;
 const units=metres===null?'NO ROUTE':metres<8?'ARRIVED':mile?(metres>=1609?`${(metres/1609.344).toFixed(1)} MI`:`${Math.round(metres*3.28084)} FT`):(metres>=1000?`${(metres/1000).toFixed(1)} KM`:`${Math.round(metres)} M`);
 const px=x??0,pz=z??0;
 return <><svg className="gps-map" viewBox={`${px-range/2} ${pz-range/2} ${range} ${range}`} role="img" aria-label="GPS road map; click a road to set a destination" onClick={e=>{const r=e.currentTarget.getBoundingClientRect();if(!r.width||!r.height)return;const p=nearestRoad(graph,{x:px-range/2+(e.clientX-r.left)/r.width*range,z:pz-range/2+(e.clientY-r.top)/r.height*range});if(p&&p.distance<=80){set(p.point);setNotice('');}else setNotice('SELECT A ROAD');}}>
  <RoadLayer roads={graph.roads}/>{route&&<polyline points={route.map(p=>`${p.x},${p.z}`).join(' ')} stroke="#8ee7ff" strokeWidth={range/90} fill="none" strokeLinejoin="round"/>}
  {destination&&<circle cx={destination.x} cy={destination.z} r={range/65} fill="#ffb75b"/>}
  {x!==null&&z!==null&&<g transform={`translate(${x} ${z}) scale(${range/170}) rotate(${180-(yaw??0)})`}><path d="M0 -7L5 6 0 3-5 6z" fill="#e3fbff" stroke="#061019" strokeWidth="1.5"/></g>}
 </svg><span className="map-north">N</span><div className="gps-controls"><button aria-label="GPS destination ahead" disabled={x===null||!graph.roads.length} onClick={()=>{const a=(yaw??0)*Math.PI/180,p=nearestRoad(graph,{x:px+Math.sin(a)*250,z:pz+Math.cos(a)*250});if(p)set(p.point);}}>GPS</button><button aria-label="Clear GPS destination" onClick={()=>set(null)}>CLEAR</button><button aria-label="Map zoom in" onClick={()=>setRange(Math.max(150,range/2))}>+</button><button aria-label="Map zoom out" onClick={()=>setRange(Math.min(1600,range*2))}>−</button></div><output className="gps-status">{notice||(!map?'MAP UNAVAILABLE':!graph.roads.length?'ROAD DATA UNAVAILABLE':x===null?'GPS UNAVAILABLE':destination?units:'SELECT DESTINATION')}</output></>;
}
export function Minimap({forceExpanded=false}:{forceExpanded?:boolean}) {
 const visible=usePreferencesStore(s=>s.hudGroups.minimap),[expanded,setExpanded]=useState(forceExpanded);
 if(!visible&&!forceExpanded)return null;
 return <section className={`hud-minimap ${forceExpanded?'map-full':''}`} data-hud-group="minimap" data-expanded={expanded} aria-label="Minimap and GPS"><button type="button" className="map-toggle" aria-label={expanded?'Minimize map':'Open map'} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>MAP {expanded?'⌄':'⌃'}</button>{expanded&&<MapContent/>}</section>;
}
