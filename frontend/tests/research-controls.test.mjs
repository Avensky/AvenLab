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
  await t.test('radio notices replace only its subtitle and clear without redrawing on GPS movement',async()=>{
   const {RadioPanel}=await load('ui/Cockpit/RadioPanel.tsx'),{useRadioStore:radio}=await load('store/radioStore.ts');let commits=0;
   radio.setState({title:'Track',artist:'Artist'});entity.resource_mask=0;await render(h(Profiler,{id:'radio',onRender:()=>commits++},h(RadioPanel,{compact:true,minimized:true})));commits=0;
   for(let i=0;i<20;i++)await act(async()=>{entity.position[0]+=1;fresh();});assert.equal(commits,0);
   const status=()=>document.querySelector('.radio-vehicle-status');assert.equal(status().textContent,'Artist');
   for(const [mask,text] of [[2,'ENGINE HOT'],[34,'COOL ENGINE'],[8,'FUEL EMPTY'],[4,'LOW FUEL'],[16,'REPAIR'],[1,'STARTING']]){
    await act(async()=>{entity.resource_mask=mask;fresh();});assert.equal(status().textContent,text);assert.equal(status().getAttribute('role'),'status');assert.equal(document.querySelector('.radio-display strong').textContent,'Track');
   }
   await act(async()=>{entity.resource_mask=0;fresh();});assert.equal(status().textContent,'Artist');assert.equal(status().dataset.alert,'false');
  });
  await t.test('map owns mission information and routes to its objective only on request',async()=>{
   const {Minimap}=await load('ui/Minimap.tsx'),{useNavigationStore:nav}=await load('store/navigationStore.ts');nav.getState().setDestination(null);nav.getState().setMission(null);await render(h(Minimap));await click('Open map');
   const info=()=>by('Mission information');assert.match(info().textContent,/SANDBOX.*FREE DRIVE/);assert.equal(by('Server match clock'),null);
   const mission={title:'Supply run',objective:'Reach the depot',target:{x:180,z:150}};
   await act(async()=>nav.getState().setMission(mission));assert.match(info().textContent,/Supply run.*Reach the depot/);assert.equal(nav.getState().destination,null);assert.ok(by('Mission objective marker'));
   await click('Navigate to mission objective');assert.deepEqual(nav.getState().destination,mission.target);
   nav.getState().setMission({...mission,target:{x:NaN,z:0}});assert.deepEqual(nav.getState().mission,mission,'invalid target cannot corrupt the objective');
   await act(async()=>network.getState().setSnapshot({tick:++tick,match_clock:{remaining_s:65,phase:'regulation'},entities:[entity]},performance.now()));assert.equal(by('Server match clock').textContent,'1:05');assert.ok(document.querySelector('.map-rim').contains(by('Server match clock')));
   await act(async()=>nav.getState().setMission(null));assert.match(info().textContent,/REACH GPS DESTINATION/);assert.deepEqual(nav.getState().destination,mission.target,'ending a mission preserves the user waypoint');await act(async()=>nav.getState().setDestination(null));
  });
  await t.test('hold charges only the parking brake, release retains it and a tap clears it',async()=>{
   const {ParkingBrakeControl}=await load('ui/Cockpit/DriveControls.tsx');await act(async()=>input.getState().setInput({cockpit_mask:undefined}));await render(h(ParkingBrakeControl));
   const later=window.setTimeout,clear=window.clearTimeout,timers=new Map();let id=0;window.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id;};window.clearTimeout=id=>timers.delete(id);
   const point=async(type)=>act(async()=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:41,button:0,clientY:100});by('Parking brake').dispatchEvent(e);});
   const advance=async ms=>{const entry=[...timers].find(([,t])=>t.ms===ms);assert.ok(entry);timers.delete(entry[0]);await act(async()=>entry[1].fn());};
   const strength=()=>unpackCockpit(input.getState().input.cockpit_mask).parkingStrength;
   try{
    await click('Parking brake');const gear=unpackCockpit(input.getState().input.cockpit_mask).gear;await point('pointerdown');await advance(250);assert.equal(strength(),1);await advance(300);assert.equal(strength(),2);await advance(300);assert.equal(strength(),3);assert.equal(timers.size,0);
    await point('pointerup');await click('Parking brake');assert.equal(strength(),3,'the post-hold click must not release the brake');assert.equal(unpackCockpit(input.getState().input.cockpit_mask).gear,gear);assert.equal(document.querySelectorAll('.parking-levels [data-filled="true"]').length,3);assert.equal(document.querySelector('.parking-levels').textContent,'');assert.equal(document.querySelectorAll('.parking-crystal').length,3);assert.equal(by('Parking brake 0 percent'),null);assert.equal(input.getState().input.throttle,0);
    await point('pointerdown');await advance(250);assert.equal(strength(),3);assert.equal(timers.size,0,'holding max must stop scheduling and never wrap');await point('pointerup');await click('Parking brake');assert.equal(strength(),3);
    await point('pointerdown');await point('pointerup');assert.equal(strength(),0,'a single tap clears on release even without a browser click');await click('Parking brake');assert.equal(strength(),0);assert.equal(document.querySelector('.ebrake-indicator'),null);
    await act(async()=>by('Parking brake').dispatchEvent(new dom.window.KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true,cancelable:true})));await advance(250);await act(async()=>by('Parking brake').dispatchEvent(new dom.window.KeyboardEvent('keyup',{code:'Space',key:' ',bubbles:true,cancelable:true})));assert.equal(strength(),1);assert.equal(timers.size,0);await click('Parking brake');assert.equal(strength(),0);
    await point('pointerdown');await advance(250);await act(async()=>window.dispatchEvent(new Event('blur')));assert.equal(timers.size,0);assert.equal(strength(),1,'focus loss stops charging but retains a deliberate latched brake');
   }finally{window.setTimeout=later;window.clearTimeout=clear;}
  });
  await t.test('one ignition key progresses while held, tap stops, and release/pause returns START to ON',async()=>{
   const {IgnitionSwitch}=await load('ui/Cockpit/IgnitionSwitch.tsx'),{unpackCabin}=await load('store/tools/cabinMasks.ts');entity.vehicle_mask=96;entity.cabin_mask=4|4096;await act(async()=>input.getState().setInput({cabin_mask:undefined}));await render(h(IgnitionSwitch));
   assert.equal(document.querySelectorAll('.ignition-system button').length,1);assert.equal(by('Hold to start engine'),null);
   const point=async type=>act(async()=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:52,button:0,clientX:0,clientY:0});by('Ignition key').dispatchEvent(e);});
   const ignition=()=>unpackCabin(input.getState().input.cabin_mask).ignition;
   const later=window.setTimeout,clear=window.clearTimeout,timers=new Map();let id=0;window.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id;};window.clearTimeout=id=>timers.delete(id);
   const advance=async ms=>{const entry=[...timers].find(([,t])=>t.ms===ms);assert.ok(entry);timers.delete(entry[0]);await act(async()=>entry[1].fn());};
   try{
    await point('pointerdown');await advance(250);assert.equal(ignition(),1);await advance(300);assert.equal(ignition(),2);await advance(300);assert.equal(ignition(),3);assert.equal(document.querySelector('.ignition-system').dataset.ignition,'START');assert.equal(timers.size,0);
    await point('pointerup');await click('Ignition key');assert.equal(ignition(),2);await point('pointerdown');await point('pointerup');await click('Ignition key');assert.equal(ignition(),0);assert.equal(input.getState().input.vehicleMask&1,0);
    await point('pointerdown');await advance(250);await advance(300);await advance(300);await act(async()=>ui.setState({overlay:'pause'}));assert.equal(ignition(),2);assert.equal(timers.size,0);await act(async()=>ui.setState({overlay:null}));
    await act(async()=>{entity.vehicle_mask=97;entity.cabin_mask=4|4096|(2<<10);fresh();});await point('pointerdown');await advance(250);assert.equal(ignition(),3,'running engine does not disable the key');await point('pointerup');await click('Ignition key');assert.equal(ignition(),2);
   }finally{window.setTimeout=later;window.clearTimeout=clear;}
  });
  await t.test('stalk center feedback ends on release and cancellation without selecting the button',async()=>{
   const {ColumnStalks}=await load('ui/Cockpit/ColumnStalks.tsx');await render(h(ColumnStalks));
   const point=async(label,type,id)=>act(async()=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:id,button:0,clientX:100,clientY:100});by(label).dispatchEvent(e);});
   for(const [i,label] of ['Lights and turn signal stalk','Wiper and washer stalk','Cruise control stalk'].entries()){
    await point(label,'pointerdown',100+i);assert.equal(by(label).dataset.held,'true');await point(label,'pointerup',100+i);await click(label);assert.equal(by(label).dataset.held,'false');
   }
   await point('Cruise control stalk','pointerdown',104);await point('Cruise control stalk','pointercancel',104);assert.equal(by('Cruise control stalk').dataset.held,'false');
  });
  await t.test('HUD pointer controls never own the gas pedal and focused HUD cannot steal the driving brake key',async()=>{
   const {DrivingHUD}=await load('ui/DrivingHUD.tsx'),{Keyboard}=await load('controls/Keyboard.ts');Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
   await act(async()=>input.getState().releaseControls());await render(h('div',null,h(Keyboard),h(DrivingHUD)));
   await act(async()=>by('Accelerate').focus());assert.equal(document.activeElement,by('Accelerate'));
   await act(async()=>{const event=new Event('pointerdown',{bubbles:true,cancelable:true});Object.assign(event,{pointerId:71,button:0,clientY:100});by('Parking brake').dispatchEvent(event);assert.equal(event.defaultPrevented,true);});
   assert.notEqual(document.activeElement,by('Accelerate'));assert.equal(input.getState().input.throttle,0);assert.equal(by('Accelerate').getAttribute('aria-pressed'),'false');
   await act(async()=>{const event=new Event('pointerup',{bubbles:true,cancelable:true});Object.assign(event,{pointerId:71,button:0,clientY:100});by('Parking brake').dispatchEvent(event);by('Parking brake').click();});assert.equal(input.getState().input.throttle,0);
   for(const label of ['Accelerate','Parking brake','Ignition key','Radio play or pause']){
    await act(async()=>by(label).focus());const before=input.getState().input.cockpit_mask,key=input.getState().input.cabin_mask;
    await act(async()=>by(label).dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true})));assert.equal(input.getState().input.brake,1,label);assert.equal(input.getState().input.throttle,0,label);assert.equal(input.getState().input.cockpit_mask,before);assert.equal(input.getState().input.cabin_mask,key);
    await act(async()=>by(label).dispatchEvent(new dom.window.KeyboardEvent('keyup',{key:' ',code:'Space',bubbles:true,cancelable:true})));assert.equal(input.getState().input.brake,0);
   }
   await act(async()=>input.getState().setAnalogFromSource('keyboard',{throttle:.6}));await click('Parking brake 67 percent');assert.equal(input.getState().input.throttle,.6,'parking must preserve intentional accelerator input');await act(async()=>input.getState().releaseControls());
  });
  await t.test('cruise and washer direction targets remain pulled until release and cancel held actions on pause',async()=>{
   const {ColumnStalks}=await load('ui/Cockpit/ColumnStalks.tsx');await render(h(ColumnStalks));
   const point=async(label,type,id)=>act(async()=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:id,button:0,clientX:100,clientY:100});by(label).dispatchEvent(e);});
   const later=window.setTimeout,clear=window.clearTimeout,timers=new Map();let id=0;window.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id;};window.clearTimeout=id=>timers.delete(id);
   try{
    await point('Cruise control stalk up','pointerdown',81);const actuator=by('Cruise control stalk').closest('.stalk-actuator');assert.equal(actuator.dataset.detent,'1');const revision=unpackCockpit(input.getState().input.cockpit_mask).revision;
    const [timerId,timer]=[...timers][0];assert.equal(timer.ms,350);timers.delete(timerId);await act(async()=>timer.fn());assert.notEqual(unpackCockpit(input.getState().input.cockpit_mask).revision,revision);assert.equal(actuator.dataset.detent,'1');
    await point('Cruise control stalk up','pointerup',81);assert.equal(actuator.dataset.detent,'0');assert.equal(timers.size,0);
    await point('Wiper and washer stalk up','pointerdown',82);assert.equal(unpackCockpit(input.getState().input.cockpit_mask).washer,true);assert.equal(by('Wiper and washer stalk').closest('.stalk-actuator').dataset.detent,'1');assert.equal(timers.size,0,'held washer needs no repeated timeout');
    await point('Wiper and washer stalk up','pointerup',82);assert.equal(unpackCockpit(input.getState().input.cockpit_mask).washer,false);
    await point('Wiper and washer stalk up','pointerdown',83);await act(async()=>ui.setState({overlay:'pause'}));assert.equal(unpackCockpit(input.getState().input.cockpit_mask).washer,false);assert.equal(by('Wiper and washer stalk').closest('.stalk-actuator').dataset.detent,'0');await act(async()=>ui.setState({overlay:null}));
   }finally{window.setTimeout=later;window.clearTimeout=clear;}
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
   await click('Parking brake 67 percent');assert.equal(by('Parking brake 67 percent').getAttribute('aria-pressed'),'true');await click('Parking brake');assert.equal(document.querySelectorAll('.parking-levels [data-filled="true"]').length,0);assert.equal(document.querySelectorAll('.shift-slot[aria-pressed]').length,0);
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
