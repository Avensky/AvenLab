import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';

test('wheel and console share authoritative packed controls without additional simulation loops',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map();
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true})){
  old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 document.hasFocus=()=>true;
 const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});let root;
 try{
  const load=path=>server.ssrLoadModule('/src/'+path);
  const {useInputStore:input}=await load('store/inputStore.ts'),{VehicleFlags:F}=await load('store/tools/inputMasks.ts');
  const {unpackCabin,reviseCabin}=await load('store/tools/cabinMasks.ts'),{unpackCockpit}=await load('store/tools/cockpitMasks.ts');
  const {useNetworkStore:network}=await load('store/networkStore.ts'),{useUIStore:ui}=await load('store/uiStore.ts');
  const {useVehicleConfigStore:configs,parseGaugeConfig}=await load('store/vehicleConfigStore.ts');
  const {projectVehicleTelemetry,updateVehicleTelemetry}=await load('store/vehicleTelemetryStore.ts');
  const {default:Steering}=await load('ui/Steering.tsx'),{ConsoleDisplay}=await load('ui/Cockpit/ConsoleDisplay.tsx');
  const {IgnitionSwitch}=await load('ui/Cockpit/IgnitionSwitch.tsx');
  const {usePreferencesStore:prefs}=await load('store/preferencesStore.ts');
  const {ClimatePanel}=await load('ui/Cockpit/ClimatePanel.tsx'),{GearSelector}=await load('ui/Cockpit/MechanicalControls.tsx');
  const {stepManualGear}=await load('controls/drivetrainActions.ts');
  const calibration={max_speed:70,hud:{cockpit_controls:true,cockpit_version:5,telemetry_mask:127,cluster_fields:8191}};
  const entity={id:'me',vehicle_id:'brz',position:[0,1,0],rotation:[0,0,0,1],speed:0,gear:1,rpm:0,fuel:25,temp:85,vehicle_mask:96,player_mask:0,cockpit_mask:192,cabin_mask:4|4096|16384,resource_mask:0};let tick=0;
  network.getState().setPlayerId('me');network.getState().setConnected(true);configs.getState().receive('me',calibration);ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});
  const publish=async patch=>act(async()=>{Object.assign(entity,patch);network.getState().setSnapshot({tick:++tick,entities:[{...entity}]},performance.now());updateVehicleTelemetry();});
  await publish({});root=createRoot(document.getElementById('root'));
  const render=async component=>{await act(async()=>root.render(null));await act(async()=>root.render(component));};
  const by=label=>document.querySelector(`[aria-label="${label}"]`)??document.querySelector(`[data-key-position="${({'Ignition off':0,'Ignition acc':1,'Ignition on':2,'Ignition start':3})[label]}"]`);
  const click=async label=>act(async()=>by(label).dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true})));
  const pointer=async(label,type,y=100,x=150,id=1)=>act(async()=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:id,button:0,clientX:x,clientY:y});by(label).dispatchEvent(e);});
  const key=async(label,key)=>act(async()=>by(label).dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,code:key,bubbles:true,cancelable:true})));
  await t.test('cabin golden word clamps HVAC, strips snapshot flags and preserves unrelated input',()=>{
   const word=reviseCabin(undefined,{temperatureC:30,fan:3,ac:true,recirculate:true,frontDefrost:true,rearDefrost:true,ignition:3,keyInserted:true},true);
   assert.equal(word,0x3ffe);assert.equal(unpackCabin(word).ignition,3);
   const hvac=reviseCabin(word|0xc000,{temperatureC:999,fan:999});assert.equal(hvac&8192,0);assert.equal(hvac&0xc000,0);assert.equal(unpackCabin(hvac).temperatureC,30);
   input.getState().setInput({cabin_mask:word,throttle:.7,steer:-.4,brake:.2});input.getState().setCabin({temperatureC:19});
   assert.equal(input.getState().input.throttle,.7);assert.equal(input.getState().input.steer,-.4);assert.equal(input.getState().input.brake,.2);
   const valid=input.getState().input.cabin_mask;for(const invalid of [-1,NaN,Infinity,16384]){input.getState().setInput({cabin_mask:invalid});assert.equal(input.getState().input.cabin_mask,valid);}
   input.getState().releaseControls();assert.equal(unpackCabin(input.getState().input.cabin_mask).ignition,2);assert.equal(unpackCabin(input.getState().input.cabin_mask).temperatureC,19);
  });
  await t.test('cabin telemetry requires v3 and finite fresh snapshot data',()=>{
   const cfg=parseGaugeConfig(calibration);assert.equal(projectVehicleTelemetry({...entity,cruise_target_kph:90},true,1000,1001,cfg).cruiseTargetKph,90);
   for(const cabin_mask of [undefined,NaN,-1,1048576,1.2])assert.equal(projectVehicleTelemetry({...entity,cabin_mask},true,1000,1001,cfg).cabinMask,null);
   assert.equal(projectVehicleTelemetry(entity,true,1000,1501,cfg).cabinMask,null);assert.equal(projectVehicleTelemetry(entity,true,1000,1001,{...cfg,cockpitVersion:2}).cabinMask,null);
  });
  await t.test('circular thumb retains vertical travel, sends proportional X and releases on pause',async()=>{
   await act(async()=>prefs.getState().update({steeringTravel:1}));
   const {wheelPoint}=await load('controls/wheelGeometry.ts');assert.deepEqual(wheelPoint(5,8,0),{x:0,y:0});assert.deepEqual(wheelPoint(NaN,0,1),{x:0,y:0});
   const edge=wheelPoint(43,43,43);assert.ok(Math.abs(Math.hypot(edge.x,edge.y)-1)<1e-9);
   input.getState().setInput({cabin_mask:undefined,cockpit_mask:undefined});await render(h(Steering));by('Steering wheel').getBoundingClientRect=()=>({x:100,y:100,width:100,height:100});
   await act(async()=>input.getState().setAnalogFromSource('keyboard',{throttle:.7}));
   await pointer('Steering wheel','pointerdown',150,171.5);assert.equal(input.getState().input.steer,.5);assert.equal(input.getState().input.throttle,.7);
   await pointer('Steering wheel','pointermove',180,171.5);assert.equal(input.getState().input.steer,.5);assert.ok(parseFloat(document.querySelector('.touch-stick-thumb').style.top)>50);
   await pointer('Steering wheel','pointermove',150,220);assert.equal(input.getState().input.steer,1);assert.match(document.querySelector('.wheel-rotor').style.transform,/135deg/);
   await pointer('Steering wheel','pointerup',150,220,99);assert.equal(input.getState().input.steer,1);
   await act(async()=>ui.setState({overlay:'pause'}));assert.equal(input.getState().input.steer,0);await act(async()=>ui.setState({overlay:null}));await pointer('Steering wheel','pointermove',150,220);assert.equal(input.getState().input.steer,0);await act(async()=>input.getState().releaseInputSource('keyboard'));
  });
  await t.test('stalk gestures separate blinkers, light rotation, single wipe, washer and cruise',async()=>{
   await render(h(Steering));await act(async()=>input.getState().setInput({cockpit_mask:undefined}));const left='Lights and turn signal stalk',right='Wiper and washer stalk',cruise='Cruise control stalk';
   await pointer(left,'pointerdown');await pointer(left,'pointermove',80);assert.ok(input.getState().input.vehicleMask&F.BLINKER_RIGHT);assert.equal(input.getState().input.vehicleMask&F.BLINKER_LEFT,0);await pointer(left,'pointerup',80);await click(left);assert.equal(input.getState().input.cockpit_mask,undefined);
   await key(left,'ArrowDown');assert.equal(input.getState().input.vehicleMask&(F.BLINKER_LEFT|F.BLINKER_RIGHT),0);await key(left,'ArrowDown');assert.ok(input.getState().input.vehicleMask&F.BLINKER_LEFT);assert.equal(input.getState().input.vehicleMask&F.BLINKER_RIGHT,0);await click(left);assert.equal(unpackCockpit(input.getState().input.cockpit_mask).lights,1);
   await key(right,'ArrowDown');assert.equal((input.getState().input.cockpit_mask>>>24)&15,10);await key(right,'ArrowUp');assert.equal(unpackCockpit(input.getState().input.cockpit_mask).washer,true);
   await act(async()=>window.dispatchEvent(new Event('blur')));assert.equal(unpackCockpit(input.getState().input.cockpit_mask).washer,false);await click(cruise);assert.equal(unpackCockpit(input.getState().input.cockpit_mask).cruiseEnabled,true);
   const later=window.setTimeout,clear=window.clearTimeout,timers=new Map();let id=0;window.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id;};window.clearTimeout=id=>timers.delete(id);
   try{await pointer(cruise,'pointerdown');await pointer(cruise,'pointermove',80);assert.equal((input.getState().input.cockpit_mask>>>24)&15,8);assert.equal([...timers.values()][0].ms,350);const revision=unpackCockpit(input.getState().input.cockpit_mask).revision;await act(async()=>[...timers.values()][0].fn());assert.notEqual(unpackCockpit(input.getState().input.cockpit_mask).revision,revision);timers.delete(1);await act(async()=>window.dispatchEvent(new Event('blur')));assert.equal(timers.size,0);}finally{window.setTimeout=later;window.clearTimeout=clear;}
   await key(cruise,'ArrowDown');assert.equal((input.getState().input.cockpit_mask>>>24)&15,9);
  });
  await t.test('key has separate OFF/ACC/ON/START requests, confirmed display and spring return',async()=>{
   await act(async()=>input.getState().setInput({cabin_mask:undefined,vehicleMask:96}));await publish({cabin_mask:4|4096|16384});await render(h(IgnitionSwitch));
   await click('Ignition acc');assert.equal(unpackCabin(input.getState().input.cabin_mask).ignition,1);assert.equal(input.getState().input.vehicleMask&1,0);
   await click('Ignition on');assert.equal(unpackCabin(input.getState().input.cabin_mask).ignition,2);assert.equal(input.getState().input.vehicleMask&1,0);assert.equal(document.querySelector('.ignition-system').dataset.ignition,'OFF');
   await publish({cabin_mask:4|4096|16384|(2<<10)});assert.equal(document.querySelector('.ignition-system').dataset.ignition,'ON');
   const later=window.setTimeout,clear=window.clearTimeout,timers=new Map();let id=0;window.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id;};window.clearTimeout=id=>timers.delete(id);
   try{await click('Ignition start');assert.equal(unpackCabin(input.getState().input.cabin_mask).ignition,3);assert.equal(input.getState().input.vehicleMask&1,1);assert.equal([...timers.values()][0].ms,1000);await act(async()=>window.dispatchEvent(new Event('blur')));assert.equal(unpackCabin(input.getState().input.cabin_mask).ignition,2);assert.equal(timers.size,0);}finally{window.setTimeout=later;window.clearTimeout=clear;}
   await click('Ignition off');await publish({cabin_mask:4|4096|16384});
   by('Ignition key').getBoundingClientRect=()=>({x:100,y:100,width:100,height:100});
   await pointer('Ignition key','pointerdown',114.64,114.64);await pointer('Ignition key','pointermove',150,200);assert.equal(unpackCabin(input.getState().input.cabin_mask).ignition,3);
   await pointer('Ignition key','pointerup',150,200);assert.equal(unpackCabin(input.getState().input.cabin_mask).ignition,2);
   await click('Ignition off');await key('Ignition key','Delete');assert.equal(unpackCabin(input.getState().input.cabin_mask).keyInserted,false);await publish({cabin_mask:4|16384});assert.ok(by('Ignition key'));assert.equal(document.querySelector('.ignition-system').dataset.keyInserted,'false');
  });
  await t.test('HVAC retains key state; non-square H gate matches the slot coordinates',async()=>{
   await act(async()=>input.getState().setInput({cabin_mask:undefined}));await publish({cabin_mask:4|4096|16384|(2<<10)});await render(h(ClimatePanel));await click('Expand climate');await key('TEMP','ArrowUp');await click('A/C');await key('FAN','ArrowUp');const cabin=unpackCabin(input.getState().input.cabin_mask);
   assert.equal(cabin.temperatureC,21);assert.equal(cabin.ac,true);assert.equal(cabin.fan,1);assert.equal(cabin.ignition,2);assert.equal(input.getState().input.cabin_mask&8192,0);assert.equal(by('A/C').getAttribute('aria-pressed'),'false');
   await render(h(GearSelector,{automatic:false,gear:1,actualGear:1,disabled:false,pending:false}));assert.equal(document.querySelector('.shift-gate svg').getAttribute('preserveAspectRatio'),'none');assert.match(document.querySelector('.shift-gate path').getAttribute('d'),/M36 25V78/);assert.equal(by('Select gear 1').style.left,'36%');assert.equal(by('Select gear 2').style.top,'78%');
  });
  await t.test('assisted shifts and console applications use the shared stores and routing',async()=>{
   await act(async()=>{input.getState().setInput({cockpit_mask:undefined});input.getState().setCockpit({automatic:false,gear:1},2);});await publish({cockpit_mask:input.getState().input.cockpit_mask&0xc0ffffff,gear:1});assert.equal(stepManualGear(1),true);assert.equal(unpackCockpit(input.getState().input.cockpit_mask).gear,2);assert.equal(stepManualGear(-1),true);assert.equal(unpackCockpit(input.getState().input.cockpit_mask).gear,1);
   await render(h(ConsoleDisplay));await click('Expand radio');await act(async()=>[...document.querySelectorAll('.console-display-tabs button')].find(b=>b.textContent==='APPS').click());await act(async()=>ui.getState().openCockpit('console'));await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='VEHICLES').click());assert.equal(ui.getState().overlay,'vehicle_select');await act(async()=>ui.setState({overlay:null}));
  });
  await t.test('controller assisted shifts, recorder priority and LB plus View use rising edges',async()=>{
   const {GameController}=await load('controls/GameController.ts');const {useRenderSettingsStore:rendering}=await load('store/renderSettingsStore.ts');
   await act(async()=>root.render(null));const raf=globalThis.requestAnimationFrame,caf=globalThis.cancelAnimationFrame,pads=navigator.getGamepads;
   const pending=new Map();let frame=0;globalThis.requestAnimationFrame=fn=>{pending.set(++frame,fn);return frame;};globalThis.cancelAnimationFrame=id=>pending.delete(id);
   const pad={connected:true,index:0,id:'wheel-test',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};navigator.getGamepads=()=>[pad];
   const poll=async()=>act(async()=>{const [id,fn]=pending.entries().next().value;pending.delete(id);fn(performance.now());});
   const press=async(index,held)=>{pad.buttons[index]={pressed:held,value:Number(held)};await poll();};
   try{
    await act(async()=>{ui.setState({overlay:null});rendering.getState().update({overlay:false});input.getState().releaseControls();input.getState().setCockpit({automatic:false,gear:1},2);});
    await publish({cockpit_mask:input.getState().input.cockpit_mask&0xc0ffffff,gear:1});await act(async()=>root.render(h(GameController)));await poll();
    await press(0,true);assert.equal(unpackCockpit(input.getState().input.cockpit_mask).gear,2);const word=input.getState().input.cockpit_mask;await poll();assert.equal(input.getState().input.cockpit_mask,word);await press(0,false);
    await press(11,true);assert.equal(unpackCockpit(input.getState().input.cockpit_mask).gear,1);await press(11,false);
    await act(async()=>rendering.getState().update({overlay:true}));const before=input.getState().input.cockpit_mask;await press(0,true);assert.equal(input.getState().input.cockpit_mask,before,'visible recorder owns A/Cross');await press(0,false);const {performanceRecorder}=await load('performance/measurements.ts');const {experimentContext}=await load('performance/context.ts');performanceRecorder.stop(experimentContext());
    await act(async()=>rendering.getState().update({overlay:false}));await press(4,true);await press(8,true);assert.equal(ui.getState().overlay,'cockpit');assert.equal(ui.getState().cockpitTab,'console');assert.equal(input.getState().input.vehicleMask&F.BOOST,0);
    await press(4,false);await press(8,false);await act(async()=>ui.setState({overlay:null}));
   }finally{await act(async()=>root.render(null));globalThis.requestAnimationFrame=raf;globalThis.cancelAnimationFrame=caf;navigator.getGamepads=pads;}
  });
  await t.test('clocks share one slow timer and the future server countdown changes only on whole seconds',async()=>{
   const {CabinClock,GearClock,MatchClock}=await load('ui/Cockpit/CabinClock.tsx');
   await act(async()=>root.render(null));const interval=window.setInterval,clear=window.clearInterval,timers=new Map();let id=0;
   window.setInterval=(fn,ms)=>{timers.set(++id,{fn,ms});return id;};window.clearInterval=id=>timers.delete(id);
   const clock=async value=>act(async()=>network.getState().setSnapshot({tick:++tick,entities:[{...entity}],...(value?{match_clock:value}:{})},performance.now()));
   try{
    await act(async()=>root.render(h('div',null,h(CabinClock),h('svg',null,h(GearClock,{lit:true})),h(MatchClock))));
    assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,30000);assert.equal(document.querySelector('.match-clock'),null);
    await clock({remaining_s:899.9,phase:'regulation'});assert.equal(document.querySelector('.match-clock').textContent,'15:00');
    let mutations=0;const observer=new dom.window.MutationObserver(records=>mutations+=records.length);observer.observe(document.querySelector('.match-clock'),{childList:true,characterData:true,subtree:true});
    try{for(let i=0;i<10;i++)await clock({remaining_s:899.8-i*.01,phase:'regulation'});await Promise.resolve();assert.equal(mutations,0);await clock({remaining_s:898.9,phase:'regulation'});assert.equal(document.querySelector('.match-clock').textContent,'14:59');}finally{observer.disconnect();}
    await clock({remaining_s:0,phase:'overtime'});assert.equal(document.querySelector('.match-clock').textContent,'OVERTIME');await clock(null);assert.equal(document.querySelector('.match-clock'),null);
    await act(async()=>root.render(null));assert.equal(timers.size,0);
   }finally{window.setInterval=interval;window.clearInterval=clear;}
  });
 }finally{if(root)await act(async()=>root.unmount());await server.close();dom.window.close();for(const[key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
