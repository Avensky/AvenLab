import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h,Profiler} from 'react';
import {createRoot} from 'react-dom/client';

test('research controls keep input, display and audio updates independent',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map();
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){
  old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 }
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
 const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});let root;
 try{
  const load=path=>server.ssrLoadModule('/src/'+path);
  const {useNetworkStore:network}=await load('store/networkStore.ts'),{useInputStore:input}=await load('store/inputStore.ts'),{useVehicleConfigStore:config}=await load('store/vehicleConfigStore.ts'),{updateVehicleTelemetry}=await load('store/vehicleTelemetryStore.ts');
  const {usePreferencesStore:prefs}=await load('store/preferencesStore.ts'),{useUIStore:ui}=await load('store/uiStore.ts'),{unpackCockpit}=await load('store/tools/cockpitMasks.ts');
  network.getState().setConnected(true);network.getState().setPlayerId('me');config.getState().receive('me',{max_speed:62,hud:{cockpit_version:5,cockpit_controls:true,telemetry_mask:127,fuel_capacity_liters:50}});ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});
  const entity={id:'me',vehicle_id:'frs',position:[0,1,0],rotation:[0,0,0,1],speed:10,rpm:3000,gear:3,fuel:30,temp:85,vehicle_mask:97,player_mask:0,cockpit_mask:192,cabin_mask:4|4096|(2<<10),boost_fraction:.5,condition:1,ultimate_fraction:0};let tick=0;
  const fresh=()=>{network.getState().setSnapshot({tick:++tick,entities:[{...entity,position:[...entity.position]}]},performance.now());updateVehicleTelemetry();};fresh();root=createRoot(document.getElementById('root'));
  const render=async component=>{await act(async()=>root.render(null));await act(async()=>{fresh();root.render(component);});},by=label=>document.querySelector(`[aria-label="${label}"]`),click=async label=>act(async()=>by(label).click());
  await t.test('twenty position-only projections cause zero dashboard commits',async()=>{
   const {default:Dashboard}=await load('ui/Dashboard/Dashboard.tsx');let commits=0;await render(h(Profiler,{id:'dashboard',onRender:()=>commits++},h(Dashboard)));commits=0;
   for(let i=0;i<20;i++)await act(async()=>{entity.position[0]+=1;fresh();});assert.equal(commits,0,'GPS movement cannot rerender unrelated instrument faces');
   await act(async()=>{entity.speed=11;fresh();});assert.ok(commits>0,'speed still reaches the speedometer');console.log('Dashboard profile: 20 position updates, 0 additional commits.');
  });
  await t.test('signal stalk latches through Left / Off / Right while cruise springs back',async()=>{
   const {ColumnStalks}=await load('ui/Cockpit/ColumnStalks.tsx'),{VehicleFlags:F}=await load('store/tools/inputMasks.ts');
   await act(async()=>input.getState().setInput({vehicleMask:97,cockpit_mask:undefined}));await render(h(ColumnStalks));
   await click('Lights and turn signal stalk up');assert.ok(input.getState().input.vehicleMask&F.BLINKER_RIGHT);assert.equal(document.querySelector('[data-latched="true"]').dataset.detent,'1');
   await click('Lights and turn signal stalk down');assert.equal(input.getState().input.vehicleMask&(F.BLINKER_LEFT|F.BLINKER_RIGHT),0);
   await click('Lights and turn signal stalk down');assert.ok(input.getState().input.vehicleMask&F.BLINKER_LEFT);assert.equal(document.querySelector('[data-latched="true"]').dataset.detent,'-1');
   const later=window.setTimeout,clear=window.clearTimeout,timers=new Map();let id=0;window.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id;};window.clearTimeout=id=>timers.delete(id);
   try{await click('Cruise control stalk up');const actuator=by('Cruise control stalk').closest('.stalk-actuator');assert.equal(actuator.dataset.detent,'1');const reset=[...timers.values()].find(t=>t.ms===150);assert.ok(reset);await act(async()=>reset.fn());assert.equal(actuator.dataset.detent,'0');assert.ok(input.getState().input.vehicleMask&F.BLINKER_LEFT);}finally{window.setTimeout=later;window.clearTimeout=clear;}
  });
  await t.test('gear slots are actions and follow automatic telemetry without a pressed highlight',async()=>{
   const {DriveGearControl,ParkingBrakeControl}=await load('ui/Cockpit/DriveControls.tsx');prefs.getState().update({shiftLayout:'h-pattern'});entity.cockpit_mask=192;entity.gear=3;await act(async()=>input.getState().setInput({cockpit_mask:undefined}));await render(h('div',null,h(DriveGearControl),h(ParkingBrakeControl)));
   await click('Select gear 6');assert.equal(unpackCockpit(input.getState().input.cockpit_mask).gear,6);assert.equal(document.querySelectorAll('.shift-slot[aria-pressed]').length,0);
   await act(async()=>{entity.cockpit_mask=(input.getState().input.cockpit_mask&0xc0ffffff)>>>0;entity.gear=2;fresh();});assert.equal(by('Drag gear stick').style.left,'36%');assert.equal(by('Drag gear stick').style.top,'78%');
   await click('Parking brake');assert.equal(by('Parking brake 33 percent').getAttribute('aria-pressed'),'true');await click('Parking brake');assert.equal(by('Parking brake 67 percent').getAttribute('aria-pressed'),'true');assert.equal(document.querySelectorAll('.shift-slot[aria-pressed]').length,0);
   const {GearSelector}=await load('ui/Cockpit/MechanicalControls.tsx');await render(h(GearSelector,{automatic:true,gear:0,disabled:false,pending:false}));await click('Select drive');assert.equal((input.getState().input.cockpit_mask>>>24)&15,11,'Drive is also a temporary forward action and can engage first at idle');
  });
  await t.test('playlist skip/replay/restart and volume reuse one audio owner',async()=>{
   const radio=await load('store/radioStore.ts'),descriptor=Object.getOwnPropertyDescriptor(globalThis,'Audio'),create=URL.createObjectURL,revoke=URL.revokeObjectURL;let count=0,revoked=0,element;
   class Player{paused=true;ended=false;volume=1;currentTime=0;constructor(){count++;element=this;}pause(){this.paused=true;this.onpause?.();}async play(){this.paused=false;this.onplay?.();}}
   Object.defineProperty(globalThis,'Audio',{configurable:true,value:Player});URL.createObjectURL=()=>`blob:track-${revoked}`;URL.revokeObjectURL=()=>revoked++;
   try{
    const files=['Artist - One.ogg','Artist - Two.ogg','Artist - Three.ogg'].map(n=>new dom.window.File(['x'],n));await act(async()=>radio.loadRadioFiles(files));assert.equal(radio.useRadioStore.getState().title,'One');assert.equal(radio.useRadioStore.getState().trackCount,3);
    await act(async()=>radio.nextRadioTrack());assert.equal(radio.useRadioStore.getState().title,'Two');element.currentTime=12;await act(async()=>radio.previousRadioTrack());assert.equal(element.currentTime,0);assert.equal(radio.useRadioStore.getState().title,'Two');await act(async()=>radio.previousRadioTrack());assert.equal(radio.useRadioStore.getState().title,'One');
    element.currentTime=8;await act(async()=>radio.restartRadio());assert.equal(element.currentTime,0);await act(async()=>radio.setRadioVolume(.25));assert.equal(element.volume,.25);await act(async()=>radio.toggleRadioMute());assert.equal(element.volume,0);await act(async()=>radio.toggleRadioMute());assert.equal(element.volume,.25);assert.equal(count,1);assert.equal(revoked,2);
    const pending=[];element.play=()=>{element.paused=false;element.onplay?.();return new Promise((resolve,reject)=>pending.push({resolve,reject}));};
    let first,second;await act(async()=>{first=radio.loadRadioFiles(files);second=radio.nextRadioTrack();});assert.equal(pending.length,2);await act(async()=>{pending[1].resolve();await second;pending[0].reject(new Error('source replaced'));await first;});assert.equal(radio.useRadioStore.getState().playing,true);assert.equal(radio.useRadioStore.getState().message,'');assert.equal(radio.useRadioStore.getState().title,'Two');
   }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;if(descriptor)Object.defineProperty(globalThis,'Audio',descriptor);else delete globalThis.Audio;}
  });
 }finally{if(root)await act(async()=>root.unmount());await server.close();dom.window.close();for(const [key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
