import React from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from '../src/ui/Dashboard/Dashboard';
import {DrivingHUD} from '../src/ui/DrivingHUD';
import {CockpitPanel} from '../src/ui/Cockpit/CockpitPanel';
import {SettingsMenu} from '../src/game/SettingsMenu';
import '../src/components/menus/menus.css';
import {useNetworkStore as network} from '../src/store/networkStore';
import {useVehicleConfigStore as config} from '../src/store/vehicleConfigStore';
import {usePreferencesStore as prefs,DEFAULT_PREFERENCES,DEFAULT_HUD_GROUPS} from '../src/store/preferencesStore';
import {useRenderSettingsStore as rendering} from '../src/store/renderSettingsStore';
import {useDebugViewStore as debugView} from '../src/store/debugViewStore';
import {useUIStore as ui} from '../src/store/uiStore';
import {useVehicleTelemetryStore as telemetry,updateVehicleTelemetry} from '../src/store/vehicleTelemetryStore';
import {useWorldStore as world} from '../src/store/worldStore';
import {useInputStore as input} from '../src/store/inputStore';
import {useNavigationStore as navigation} from '../src/store/navigationStore';
import '../src/ui/drivingHud.css';

let layout=!new URLSearchParams(location.search).has('instruments');
document.body.className=layout?'layout-review':'instrument-review';
const style=document.createElement('style');style.textContent=`*{box-sizing:border-box}body{margin:0;background:#090e16;color:#e2e8f0;font:11px ui-monospace,monospace}body.layout-review{height:100dvh;overflow:hidden;background:radial-gradient(ellipse at 50% 30%,#27364144,transparent 60%),linear-gradient(#0c121d,#111d2a)}#review-controls{position:fixed;left:50%;transform:translateX(-50%);top:8px;z-index:100;max-width:min(460px,95vw);background:#09131ed9;border:1px solid #607b8d60;color:#b7ced8}#review-controls summary{cursor:pointer;text-align:right;font:8px monospace;padding:5px 7px;list-style:none}#review-controls:not([open]){width:82px}#review-controls .review-actions{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:7px;width:min(460px,92vw)}#review-controls strong{width:100%;font-size:8px;color:#97b4c5}#review-controls button{padding:4px 6px;border:1px solid #63708377;background:#152231aa;color:#e2e8f0;font:8px monospace;cursor:pointer}#review-controls label{display:flex;align-items:center;gap:5px;font-size:8px}#review-controls input{width:70px}.instrument-review .driving-dashboard{position:relative;inset:auto;transform:none;width:min(1080px,96vw);margin:16px auto}.tabbed-menu{position:fixed;inset:0;z-index:70;background:#07101a;color:#e4eef4}.tabbed-menu-shell{height:100dvh;width:100%;display:flex;flex-direction:column;overflow:hidden}.tabbed-menu-content{flex:1;min-height:0;overflow:auto}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`;document.head.append(style);
let phase='running',tick=0,lamps=false,lastRequest:number|undefined,lastCabin:number|undefined;
let cockpit=192,electrical=4|4096|16384|(2<<10),cruise=false,target=0,rejected=0,rearmed=false,requestedTcs=true,sampleUltimate=.37,sampleResourceMask=0,sampleMission=false;
let startAt=0,wipeUntil=0,hintGear=1,hintRemaining=0,lastPublish=performance.now();
function setup(){network.getState().setConnected(true);network.getState().setPlayerId('review');config.getState().receive('review',{max_speed:70,hud:{telemetry_mask:127,cockpit_controls:true,cockpit_version:5,cluster_fields:8191,max_rpm:9000,redline_rpm:7500,fuel_capacity_liters:50,min_temp_c:40,overheat_c:110,critical_c:130,ambient_temp_c:25}});}
function publish(){
 if(phase==='lost'){network.getState().setConnected(false);updateVehicleTelemetry();return;}
 const controls=input.getState().input,request=controls.cockpit_mask,key=controls.cabin_mask,now=performance.now(),elapsed=Math.min(200,now-lastPublish);lastPublish=now;
 if(key!==undefined&&key!==lastCabin){lastCabin=key;electrical=(electrical&~0xf03ff)|(key&0xf03ff);
   if(key&8192){electrical=(electrical&~(3<<10|4096))|(key&(3<<10|4096));const stage=(electrical>>>10)&3;
     if(!(key&4096)||stage<2)phase='off';else if(stage===3){if(phase!=='running'&&phase!=='idle'){phase='cranking';startAt=now;}}else if(phase==='cranking')phase='off';}
 }
 if(phase==='cranking'&&now-startAt>=700){phase='idle';electrical=(electrical&~(3<<10))|(2<<10);}
 if(request!==undefined&&request!==lastRequest){lastRequest=request;rejected=0;const cmd=(request>>>24)&15,next=(request&0xc0ffffff)>>>0;
   const gear=(next>>>7)&15;if(cmd===2&&phase==='running'&&(gear===8||gear===7)){rejected=2;cockpit=(next&~((15<<7)|(1<<11)))|(cockpit&((15<<7)|(1<<11)));}else cockpit=next;
   if(cmd===11&&gear>0&&gear<7){hintGear=gear;hintRemaining=750;}
   if(cmd===1){rearmed=false;requestedTcs=Boolean(controls.vehicleMask&64);}
   if(!(cockpit&(1<<13))){cruise=false;target=0;}
   if(cmd===4){const action=(cockpit>>>14)&3;if(action===3)cruise=false;else if(action===1||action===2){if(phase==='running'){cruise=true;target=128;}else rejected=3;}}
   if(cmd===8||cmd===9){if(!(cockpit&(1<<13))||phase!=='running')rejected=3;else if(cruise)target=Math.max(40,Math.min(200,target+(cmd===8?1.6:-1.6)));else if(cmd===9||target>0){cruise=true;target=target||128;}else rejected=3;}
   if(cmd===10)wipeUntil=now+850;if(cmd===5&&(cockpit&4096))wipeUntil=now+1800;
 }
 if(phase==='running'||Math.abs(controls.throttle)>.05)hintRemaining=Math.max(0,hintRemaining-elapsed);
 const on=phase==='running'||phase==='idle';
 if(!on){cockpit&=~(3<<4);requestedTcs=true;rearmed=false;cruise=false;}
 const assist=(cockpit>>>4)&3;if((assist===2||(assist===1&&!requestedTcs))&&phase==='running')rearmed=true;
 const automatic=Boolean(cockpit&64),selection=(cockpit>>>7)&15,park=Boolean(cockpit&2048)||selection===8;
 const gear=selection===7?-1:selection===8?0:automatic&&selection>0&&selection<7?(hintRemaining>0?hintGear:phase==='running'?3:1):selection;
 const lights=cockpit&3,lit=lights>=2||(lights===1&&on),tcs=assist===1?requestedTcs||rearmed:assist===2?rearmed:assist===3?false:true;
 let vehicleMask=(controls.vehicleMask&~(1|2|64))|(on?1:0)|(lit?2:0)|(tcs?64:0);if(lamps&&phase!=='off')vehicleMask|=16;
 const confirmed=(cockpit&0xc0ffffff)|(cruise?(1<<24):0)|(rearmed?(1<<25):0)|(park?(1<<26):0)|(request!==undefined?(1<<27):0)|(rejected<<28);
 const telltales=(lamps&&phase!=='off'?8191:0)|(lights===3?8:0)|(cockpit&(1<<13)?4:0)|(park?512:0);
 network.getState().setSnapshot({tick:++tick,...(sampleMission?{match_clock:{remaining_s:900,phase:'regulation' as const}}:{}),entities:[{id:'review',kind:'car',room_id:0,vehicle_id:'brz',position:[0,1,0],rotation:[0,0,0,1],engine_torque:0,
 speed:phase==='running'?128/3.6:0,rpm:on?(phase==='running'?3200:850):phase==='cranking'?350:0,gear,fuel:32.5,temp:85,boost_fraction:.72,condition:.82,ultimate_fraction:sampleUltimate,
 vehicle_mask:vehicleMask,player_mask:0,resource_mask:phase==='cranking'?1:sampleResourceMask,cluster_mask:telltales,cockpit_mask:confirmed>>>0,cabin_mask:electrical|(now<wipeUntil?32768:0),cruise_target_kph:cruise?target:undefined}]},now);updateVehicleTelemetry();
}
world.getState().setMap({schema_version:1,map_id:'preview-roads',coordinate_system:{units:'meters',up_axis:'Y',forward_axis:'+Z'},cell:[400,400],surface:{road_y:0},layout:{kind:'fixed_grid',origin:[0,0],size:[1,1]},visuals:[],chunks:[],collider_chunks:[{x:0,z:0,boxes:[{id:'north-road',visual:'',kind:'road',center:[0,0,0],half_extents:[7,1,320]},{id:'east-road',visual:'',kind:'road',center:[0,0,150],half_extents:[320,1,7]},{id:'parallel-road',visual:'',kind:'road',center:[180,0,0],half_extents:[7,1,320]}]}]});
setup();prefs.persist.setOptions({name:'avenlab-cockpit-preview-only'});rendering.persist.setOptions({name:'avenlab-preview-render-only'});debugView.persist.setOptions({name:'avenlab-preview-debug-only'});prefs.getState().update({...DEFAULT_PREFERENCES,speedUnit:'mph',showTouchControls:true,showDriveControls:true,shiftLayout:'h-pattern'});ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});publish();
export function PreviewApp(){const overlay=ui(s=>s.overlay);if(overlay==='cockpit')return <CockpitPanel/>;
 if(overlay==='settings')return <SettingsMenu/>;
 if(overlay)return <div style={{padding:30}}><p>{overlay.toUpperCase()} OPENS IN THE RUNNING GAME</p><button onClick={()=>ui.getState().openCockpit('console')}>BACK TO CONSOLE</button><button onClick={()=>ui.getState().closeOverlay()}>CLOSE</button></div>;
 return layout?<DrivingHUD/>:<Dashboard/>;}
const root=createRoot(document.getElementById('root')!);root.render(<PreviewApp/>);setInterval(publish,100);
const api={setResourceMask(value:number){sampleResourceMask=value;publish();},navigation,setUltimate(value:number){sampleUltimate=Math.max(0,Math.min(1,value));publish();},setPhase(value:string){phase=value;startAt=performance.now();electrical=(electrical&~(3<<10))|((value==='off'?0:value==='cranking'?3:2)<<10);input.getState().setInput({cabin_mask:undefined});lastCabin=undefined;setup();publish();},setLamps(value:boolean){lamps=value;publish();},input,prefs,telemetry,network,ui};
Object.assign(window,{instrumentQa:api});
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-phase]'))button.onclick=()=>api.setPhase(button.dataset.phase!);
document.getElementById('review-cockpit')!.onclick=()=>ui.getState().openCockpit('console');
document.getElementById('review-lamps')!.onclick=()=>api.setLamps(!lamps);
document.getElementById('review-hot')!.onclick=()=>api.setResourceMask(sampleResourceMask?0:2);
document.getElementById('review-mission')!.onclick=()=>{sampleMission=!sampleMission;navigation.getState().setMission(sampleMission?{title:'PREVIEW MISSION',objective:'REACH THE CHECKPOINT',target:{x:180,z:150}}:null);publish();};
document.getElementById('review-standard')!.onclick=()=>prefs.getState().update({drivingLayout:'standard',showTouchControls:true,showDriveControls:true});
document.getElementById('review-settings')!.onclick=()=>ui.getState().setOverlay('settings');
document.getElementById('review-restore')!.onclick=()=>prefs.getState().update({hudGroups:{...DEFAULT_HUD_GROUPS},showTouchControls:true,showDriveControls:true});
document.getElementById('review-controller')!.onclick=()=>prefs.getState().update({drivingLayout:'controller',showTouchControls:false,showDriveControls:false});
document.getElementById('review-touch')!.onclick=()=>prefs.getState().update({showTouchControls:!prefs.getState().showTouchControls});
document.getElementById('review-switches')!.onclick=()=>prefs.getState().update({showDriveControls:!prefs.getState().showDriveControls});
document.getElementById('review-scale')!.onclick=()=>{layout=!layout;document.body.className=layout?'layout-review':'instrument-review';root.render(<PreviewApp/>);};
document.getElementById('review-charge')!.oninput=event=>api.setUltimate(Number((event.target as HTMLInputElement).value)/100);
