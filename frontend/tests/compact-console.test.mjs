import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';

test('compact cockpit, GPS and inspection preserve authoritative state',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map();
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){
  old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 }
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
 const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});let root;
 try{
  const load=path=>server.ssrLoadModule('/src/'+path);
  const {useNetworkStore:network}=await load('store/networkStore.ts'),{useVehicleConfigStore:config}=await load('store/vehicleConfigStore.ts');
  const {updateVehicleTelemetry}=await load('store/vehicleTelemetryStore.ts'),{useInputStore:input}=await load('store/inputStore.ts');
  const {usePreferencesStore:prefs,DEFAULT_HUD_GROUPS}=await load('store/preferencesStore.ts'),{useUIStore:ui}=await load('store/uiStore.ts');
  const {useWorldStore:world}=await load('store/worldStore.ts'),{useGameStore:game}=await load('store/gameStore.ts');
  network.getState().setConnected(true);network.getState().setPlayerId('me');config.getState().receive('me',{max_speed:70,hud:{cockpit_controls:true,cockpit_version:5,ambient_temp_c:25,telemetry_mask:127,cluster_fields:8191}});
  const entity={id:'me',vehicle_id:'brz',position:[0,1,0],rotation:[0,0,0,1],speed:0,rpm:850,gear:6,fuel:30,temp:85,vehicle_mask:97,player_mask:0,cockpit_mask:192,cabin_mask:4|4096|16384|(2<<10)};
  let tick=0;const fresh=()=>{network.getState().setSnapshot({tick:++tick,entities:[entity]},performance.now());updateVehicleTelemetry();};fresh();ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});
  root=createRoot(document.getElementById('root'));
  const render=async component=>{await act(async()=>root.render(null));await act(async()=>{fresh();root.render(component);});};
  const by=label=>document.querySelector(`[aria-label="${label}"]`),click=async label=>act(async()=>by(label).click());
  await t.test('NOS ends at 7.5 and ultimate mirrors the condition arc',async()=>{
   const {ResourceRing}=await load('ui/Dashboard/ResourceRings.tsx');
   await render(h(ResourceRing,{kind:'rpm',fraction:1}));const d=document.querySelector('.resource-ring-track').getAttribute('d'),end=d.trim().split(/\s+/).slice(-2).map(Number);
   const angle=135+(7.5/9)*(355-135);assert.ok(Math.abs(end[0]-(100+103*Math.cos(angle*Math.PI/180)))<.001);assert.ok(Math.abs(end[1]-(100+103*Math.sin(angle*Math.PI/180)))<.001);
   await render(h(ResourceRing,{kind:'speed',fraction:.8}));const condition=document.querySelector('path').getAttribute('d');
   await render(h(ResourceRing,{kind:'hero',fraction:1}));assert.equal(document.querySelector('path').getAttribute('d'),condition);assert.equal(document.querySelector('path').getAttribute('transform'),'translate(200 0) scale(-1 1)');assert.equal(document.querySelector('[data-ready]').dataset.ready,'true');
  });
  await t.test('extended climate bits round-trip without granting ignition or snapshot flags',async()=>{
   const {reviseCabin,unpackCabin}=await load('store/tools/cabinMasks.ts');const prior=4|4096|(2<<10)|0xc000;
   const packed=reviseCabin(prior,{airflow:4,fan:4,temperatureC:30});assert.equal(packed&0xe000,0);assert.ok(packed&(1<<19));assert.equal(unpackCabin(packed).fan,4);assert.equal(unpackCabin(packed).airflow,4);assert.equal(unpackCabin(packed).ignition,2);
   input.getState().setInput({cabin_mask:packed});input.getState().setInput({cabin_mask:packed|0x4000});assert.equal(input.getState().input.cabin_mask,packed);
   assert.equal(unpackCabin(reviseCabin(packed,{fan:2,airflow:99})).fan,2);assert.equal(unpackCabin(reviseCabin(packed,{airflow:99})).airflow,4);
  });
  await t.test('default console has no close bars and expands only radio or three Fahrenheit knobs',async()=>{
   const {DrivingHUD}=await load('ui/DrivingHUD.tsx');prefs.getState().update({hudGroups:{...DEFAULT_HUD_GROUPS},showDriveControls:true,showTouchControls:true});await render(h(DrivingHUD));
   assert.equal(document.querySelector('.hud-group-bar,.hud-group-header,.drive-dock-header'),null);assert.equal([...document.querySelectorAll('button')].filter(b=>(b.getAttribute('aria-label')??'').startsWith('Hide ')).length,0);
   assert.ok(by('Ignition key'));assert.equal(document.querySelectorAll('[data-key-position]').length,4);assert.equal(by('Ambient temperature').textContent,'77°F');assert.equal(document.querySelector('.climate-three-knobs'),null);assert.equal(document.querySelector('.console-display-tabs'),null);
   const dock=document.querySelector('.drive-dock');assert.ok(dock.lastElementChild.classList.contains('pedal-hud'));assert.equal(document.querySelector('.mechanical-shifter').closest('.transmission-console'),document.querySelector('.mechanical-handbrake').closest('.transmission-console'));
   await click('Expand climate');assert.equal(document.querySelectorAll('.climate-knob').length,3);assert.match(by('TEMP').getAttribute('aria-valuetext'),/°F$/);await click('Minimize climate');assert.equal(document.querySelector('.climate-three-knobs'),null);
   await click('Expand radio');const keybinds=[...document.querySelectorAll('.console-display-tabs button')].find(b=>b.textContent==='KEYBINDS');await act(async()=>keybinds.click());assert.equal(ui.getState().overlay,'settings');assert.equal(ui.getState().settingsTab,'keyboard');ui.setState({overlay:null});
  });
  const box=(id,x,z,hx,hz,kind='road')=>({id,center:[x,0,z],half_extents:[hx,1,hz],kind,visual:''});
  await t.test('GPS follows intersecting roads, rejects disconnected routes and bounds malformed data',async()=>{
   const {buildRoadGraph,nearestRoad,roadRoute,pathDistance}=await load('navigation/roadNavigation.ts');
   const graph=buildRoadGraph([box('a',0,0,100,5),box('b',80,80,5,100),box('d',1000,1000,5,50),box('duplicate',0,0,100,5),box('building',0,0,9,9,'building'),box('bad',NaN,0,4,4)]);
   assert.equal(graph.roads.length,3);assert.deepEqual(roadRoute(graph,0,1),[{x:80,z:0}]);assert.equal(roadRoute(graph,0,2),null);assert.equal(roadRoute(graph,-1,1),null);
   assert.deepEqual(nearestRoad(graph,{x:4,z:2}).point,{x:4,z:0});assert.equal(pathDistance([{x:0,z:0},{x:80,z:0},{x:80,z:80}]),160);
   assert.equal(buildRoadGraph(Array.from({length:1100},(_,i)=>box(String(i),i*30,0,5,5))).roads.length,1024);
  });
  await t.test('minimap creates a GPS route using existing position telemetry',async()=>{
   const {Minimap}=await load('ui/Minimap.tsx'),{useNavigationStore:nav}=await load('store/navigationStore.ts');
   world.getState().setMap({schema_version:1,map_id:'test',coordinate_system:{units:'meters',up_axis:'Y',forward_axis:'+Z'},cell:[200,200],surface:{road_y:0},layout:{kind:'fixed_grid',origin:[0,0],size:[1,1]},visuals:[],chunks:[],collider_chunks:[{x:0,z:0,boxes:[box('a',0,0,5,300),box('b',80,150,100,5)]}]});
   await render(h(Minimap));assert.equal(document.querySelector('.gps-map'),null);await click('Open map');assert.equal(document.querySelectorAll('.gps-map rect').length,2);await click('GPS destination ahead');assert.ok(nav.getState().destination);assert.ok(document.querySelector('.gps-map polyline'));assert.notEqual(document.querySelector('.gps-status').textContent,'NO ROUTE');await click('Clear GPS destination');assert.equal(nav.getState().destination,null);await click('Minimize map');assert.equal(document.querySelector('.gps-map'),null);
  });
  await t.test('automatic H animation goes directly through neutral without sending fake shifts',async()=>{
   const {GearSelector}=await load('ui/Cockpit/MechanicalControls.tsx');prefs.getState().update({reducedMotion:false});await render(h(GearSelector,{automatic:false,gear:6,disabled:false,pending:false}));
   const gate=document.querySelector('.shift-gate'),knob=by('Drag gear stick');gate.getBoundingClientRect=()=>({width:100,height:100});let frames;
   knob.animate=(keyframes,options)=>{frames=keyframes;assert.equal(options.duration,260);return {cancel(){}};};const before=input.getState().input.cockpit_mask;
   await act(async()=>root.render(h(GearSelector,{automatic:false,gear:1,disabled:false,pending:false})));
   assert.equal(frames.length,4);assert.match(frames[1].transform,/50px, 26px/);assert.match(frames[2].transform,/0px, 26px/);assert.equal(knob.style.left,'36%');assert.equal(input.getState().input.cockpit_mask,before);
  });
  await t.test('driving views cycle without gallery and bird view stays world aligned',async()=>{
   const {nextDrivingView,specialCameraPreset}=await load('utils/drivingViews.ts'),{VehicleCameraFollower}=await load('utils/cameraFollow.ts');assert.equal(nextDrivingView('DEFAULT'),'FIRST_PERSON');assert.equal(nextDrivingView('FIRST_PERSON'),'BIRDS_EYE');assert.equal(nextDrivingView('BIRDS_EYE'),'DEFAULT');
   const preset=specialCameraPreset('BIRDS_EYE','brz'),f=new VehicleCameraFollower();f.update({position:[10,2,20],rotation:[0,Math.SQRT1_2,0,Math.SQRT1_2]},preset.offset,preset.targetOffset,0,0,7,10,1/60,preset.worldAligned);assert.ok(f.position.distanceTo({x:10,y:38,z:19.99})<.001);assert.equal(specialCameraPreset('FIRST_PERSON','tank').worldAligned,false);
  });
  await t.test('inspection releases input and restores diagnostic preferences on exit',async()=>{
   const {enterInspection,leaveInspection}=await load('store/inspectionActions.ts'),{canDrive}=await load('store/tools/inputRouting.ts');game.getState().setEditor(false);world.setState({debugEnabled:false,debugMask:32,mode:'glb'});input.getState().setAnalogFromSource('keyboard',{throttle:1,steer:.5});ui.setState({overlay:null});
   await act(async()=>enterInspection('collider'));assert.equal(input.getState().input.throttle,0);assert.equal(game.getState().editor,true);assert.equal(canDrive(),false);assert.equal(world.getState().mode,'hybrid');await act(async()=>enterInspection('handling'));await act(async()=>leaveInspection());assert.equal(world.getState().debugMask,32);assert.equal(world.getState().debugEnabled,false);assert.equal(world.getState().mode,'glb');assert.equal(game.getState().editor,false);
   await act(async()=>enterInspection());await act(async()=>ui.setState({screen:'main'}));assert.equal(game.getState().editor,false);assert.equal(world.getState().debugMask,32,'leaving a session cannot strand the next game in the inspector');
  });
 }finally{if(root)await act(async()=>root.unmount());await server.close();dom.window.close();for(const [key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
