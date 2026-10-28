import React from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from '../src/ui/Dashboard/Dashboard';
import {DrivingHUD} from '../src/ui/DrivingHUD';
import {CockpitPanel} from '../src/ui/Cockpit/CockpitPanel';
import {useNetworkStore as network} from '../src/store/networkStore';
import {useVehicleConfigStore as config} from '../src/store/vehicleConfigStore';
import {usePreferencesStore as prefs} from '../src/store/preferencesStore';
import {useUIStore as ui} from '../src/store/uiStore';
import {useVehicleTelemetryStore as telemetry,updateVehicleTelemetry} from '../src/store/vehicleTelemetryStore';
import {useInputStore as input} from '../src/store/inputStore';
import '../src/ui/drivingHud.css';

let layout=!new URLSearchParams(location.search).has('instruments');
document.body.className=layout?'layout-review':'instrument-review';
const style=document.createElement('style');style.textContent=`*{box-sizing:border-box}body{margin:0;background:#090e16;color:#e2e8f0;font:11px ui-monospace,monospace}body.layout-review{min-height:100vh;background:radial-gradient(ellipse at 50% 30%,#27364144,transparent 60%),linear-gradient(#0c121d,#111d2a)}#review-controls{position:relative;z-index:21;display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:10px;max-width:1000px}#review-controls strong{width:100%;font-size:10px;color:#97b4c5}#review-controls button{padding:5px 7px;border:1px solid #63708377;background:#152231aa;color:#e2e8f0;font:9px monospace;cursor:pointer}#review-controls label{display:flex;align-items:center;gap:5px;font-size:9px}#review-controls input{width:85px}.instrument-review .driving-dashboard{position:relative;inset:auto;transform:none;width:min(1080px,96vw);margin:16px auto}.instrument-review .dashboard-heading{height:36px}.instrument-review .resource-line{font-size:clamp(7px,1.1vw,13px)}.instrument-review .resource-line i{height:7px}@media(max-height:350px){#review-controls{max-width:430px;padding:5px;gap:3px}#review-controls button{padding:4px;font-size:8px}#review-controls strong{font-size:8px}}`;document.head.append(style);
let phase='running',tick=0,lamps=false,lastRequest:number|undefined;
let cabin=192,cruise=false,rejected=0,rearmed=false,requestedTcs=true,sampleUltimate=.37;
function setup(){network.getState().setConnected(true);network.getState().setPlayerId('review');config.getState().receive('review',{max_speed:70,hud:{telemetry_mask:127,cockpit_controls:true,cockpit_version:2,cluster_fields:8191,max_rpm:9000,redline_rpm:7500,fuel_capacity_liters:50,min_temp_c:40,overheat_c:110,critical_c:130}});}
function publish(){
 if(phase==='lost'){network.getState().setConnected(false);updateVehicleTelemetry();return;}
 const request=input.getState().input.cockpit_mask,on=phase==='running'||phase==='idle';
 if(request!==undefined&&request!==lastRequest){lastRequest=request;rejected=0;const cmd=(request>>>24)&15,next=(request&0xc0ffffff)>>>0;
   const gear=(next>>>7)&15;if(cmd===2&&phase==='running'&&(gear===8||gear===7)){rejected=2;cabin=(next&~((15<<7)|(1<<11)))|(cabin&((15<<7)|(1<<11)));}else cabin=next;
   if(cmd===1){rearmed=false;requestedTcs=Boolean(input.getState().input.vehicleMask&64);}
   if(!(cabin&(1<<13)))cruise=false;
   if(cmd===4){const action=(cabin>>>14)&3;if(action===3)cruise=false;else if(action===1||action===2){if(phase==='running')cruise=true;else rejected=3;}}
 }
 if(phase==='off'||phase==='cranking'){cabin&=~(3<<4);requestedTcs=true;rearmed=false;}
 const assist=(cabin>>>4)&3;if((assist===2||(assist===1&&!requestedTcs))&&phase==='running')rearmed=true;
 const automatic=Boolean(cabin&(1<<6)),selection=(cabin>>>7)&15,park=Boolean(cabin&(1<<11))||selection===8;
 const gear=selection===7?-1:selection===8?0:automatic&&selection===1?(phase==='running'?3:1):selection;
 const lights=cabin&3,lit=lights>=2||(lights===1&&on),tcs=assist===1?requestedTcs||rearmed:assist===2?rearmed:assist===3?false:true;
 let vehicleMask=(input.getState().input.vehicleMask&~(1|2|64))|(on?1:0)|(lit?2:0)|(tcs?64:0);
 if(lamps&&phase!=='off')vehicleMask|=16;
 const confirmed=(cabin&0xc0ffffff)|(cruise?(1<<24):0)|(rearmed?(1<<25):0)|(park?(1<<26):0)|(request!==undefined?(1<<27):0)|(rejected<<28);
 const telltales=(lamps&&phase!=='off'?8191:0)|(lights===3?8:0)|(cabin&(1<<13)?4:0)|(park?512:0);
 network.getState().setSnapshot({tick:++tick,entities:[{id:'review',kind:'car',room_id:0,vehicle_id:'brz',position:[0,1,0],rotation:[0,0,0,1],engine_torque:0,
 speed:phase==='running'?128/3.6:0,rpm:on?(phase==='running'?3200:850):phase==='cranking'?350:0,gear,fuel:32.5,temp:85,boost_fraction:1,condition:1,ultimate_fraction:sampleUltimate,
 vehicle_mask:vehicleMask,player_mask:0,resource_mask:phase==='cranking'?1:0,cluster_mask:telltales,cockpit_mask:confirmed>>>0}]},performance.now());updateVehicleTelemetry();
}
setup();prefs.getState().update({speedUnit:'mph'});ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});publish();
export function PreviewApp(){const overlay=ui(s=>s.overlay);if(overlay==='cockpit')return <CockpitPanel/>;
 if(overlay)return <div style={{padding:30}}><p>{overlay.toUpperCase()} OPENS IN THE RUNNING GAME</p><button onClick={()=>ui.getState().openCockpit('vehicle')}>BACK TO COCKPIT</button></div>;
 return layout?<DrivingHUD/>:<Dashboard/>;}
const root=createRoot(document.getElementById('root')!);root.render(<PreviewApp/>);
setInterval(publish,100);
const api={setUltimate(value:number){sampleUltimate=Math.max(0,Math.min(1,value));publish();},setPhase(value:string){phase=value;setup();publish();},setLamps(value:boolean){lamps=value;publish();},input,prefs,telemetry,network};
Object.assign(window,{instrumentQa:api});
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-phase]'))button.onclick=()=>api.setPhase(button.dataset.phase!);
document.getElementById('review-cockpit')!.onclick=()=>ui.getState().openCockpit();
document.getElementById('review-lamps')!.onclick=()=>api.setLamps(!lamps);

document.getElementById('review-standard')!.onclick=()=>prefs.getState().update({drivingLayout:'standard',showTouchControls:true,showDriveControls:true});
document.getElementById('review-controller')!.onclick=()=>prefs.getState().update({drivingLayout:'controller',showTouchControls:false,showDriveControls:false});
document.getElementById('review-touch')!.onclick=()=>prefs.getState().update({showTouchControls:!prefs.getState().showTouchControls});
document.getElementById('review-switches')!.onclick=()=>prefs.getState().update({showDriveControls:!prefs.getState().showDriveControls});
document.getElementById('review-scale')!.onclick=()=>{layout=!layout;document.body.className=layout?'layout-review':'instrument-review';root.render(<PreviewApp/>);};
document.getElementById('review-charge')!.oninput=event=>api.setUltimate(Number((event.target as HTMLInputElement).value)/100);
