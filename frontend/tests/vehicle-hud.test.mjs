import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';

test('restored gauges consume Rust telemetry without inventing resource state or competing input owners', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const previous = new Map(), globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, localStorage: dom.window.localStorage,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key,value] of Object.entries(globals)) { previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value}); }
  document.hasFocus = () => true;
  const server = await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  let root;
  try {
    const load=path=>server.ssrLoadModule(`/src/${path}`);
    const {useNetworkStore:network}=await load('store/networkStore.ts');
    const {useVehicleConfigStore:configs,parseGaugeConfig,TelemetryFields,DEFAULT_GAUGE_CONFIG}=await load('store/vehicleConfigStore.ts');
    const {useVehicleTelemetryStore:telemetry,projectVehicleTelemetry,updateVehicleTelemetry,startVehicleTelemetry,HUD_UPDATE_HZ}=await load('store/vehicleTelemetryStore.ts');
    const {useInputStore:inputs,inputRef}=await load('store/inputStore.ts');
    const {VehicleFlags}=await load('store/tools/inputMasks.ts');
    const {useUIStore:ui}=await load('store/uiStore.ts');
    const {usePreferencesStore:prefs,sanitizePreferences}=await load('store/preferencesStore.ts');
    const {usePerformanceOverlayStore:inspector,togglePerformanceDetails}=await load('performance/performanceOverlayStore.ts');
    const {DrivingHUD}=await load('ui/DrivingHUD.tsx');
    const base={id:'me',vehicle_id:'brz',position:[0,1,0],rotation:[0,0,0,1],speed:10,rpm:0,gear:0,fuel:0,temp:0,vehicle_mask:VehicleFlags.ENGINE_ON,player_mask:0};
    const calibrated={max_speed:80,hud:{cockpit_controls:true,cockpit_version:2,telemetry_mask:31,max_rpm:9000,redline_rpm:7500,fuel_capacity_liters:50,min_temp_c:40,overheat_c:110,critical_c:130}};
    const live={...base,rpm:4250,gear:3,fuel:25,temp:90,boost_fraction:.75};
    let tick=0;
    const snapshot=entity=>network.getState().setSnapshot({tick:++tick,entities:[entity]},performance.now());
    network.getState().setConnected(true);network.getState().setPlayerId('me');ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});

    await t.test('legacy zero placeholders remain unavailable while live speed is converted from m/s once',()=>{
      const config=parseGaugeConfig({max_speed:80});assert.equal(config.speedMaxKph,320);assert.equal(config.telemetryMask,0);
      const data=projectVehicleTelemetry(base,true,1000,1001,config);
      assert.equal(data.speedKph,36);assert.equal(data.engineOn,true);
      for(const field of ['rpm','gear','fuelLiters','tempC','boostFraction'])assert.equal(data[field],null,field);
      assert.equal(data.boostActive,false);
    });
    await t.test('explicit availability distinguishes a real empty tank/zero RPM from missing telemetry',()=>{
      const config=parseGaugeConfig(calibrated), data=projectVehicleTelemetry({...base,boost_fraction:0},true,1000,1001,config);
      assert.equal(data.rpm,0);assert.equal(data.gear,0);assert.equal(data.fuelLiters,0);assert.equal(data.tempC,0);assert.equal(data.boostFraction,0);
      const moving=projectVehicleTelemetry({...live,vehicle_mask:VehicleFlags.ENGINE_ON|VehicleFlags.BOOST},true,1000,1001,config);
      assert.equal(moving.rpm,4250);assert.equal(moving.fuelLiters,25);assert.equal(moving.tempC,90);assert.equal(moving.boostActive,true);
      assert.equal(projectVehicleTelemetry({...live,telemetry_mask:0},true,1000,1001,config).rpm,null,'explicit per-entity zero disables stale config capabilities');
      assert.equal(projectVehicleTelemetry({...live,telemetry_mask:-1},true,1000,1001,config).rpm,null,'invalid availability is not treated as full support');
    });
    await t.test('stale/absent/disconnected local players blank readings instead of using another car',()=>{
      const config=parseGaugeConfig(calibrated);
      for(const [entity,connected,received,now,signal] of [[live,true,1000,1501,'stale'],[live,true,1001,1000,'stale'],[null,true,1000,1001,'waiting'],[live,false,1000,1001,'offline']]){
        const data=projectVehicleTelemetry(entity,connected,received,now,config);assert.equal(data.signal,signal);assert.equal(data.speedKph,null);assert.equal(data.rpm,null);assert.equal(data.boostFraction,null);
      }
      network.getState().setPlayerId('absent');snapshot(live);updateVehicleTelemetry();assert.equal(telemetry.getState().data.signal,'waiting');
      network.getState().setPlayerId('me');
    });
    await t.test('invalid optional values and calibration cannot introduce NaN, infinite scales or a false warning',()=>{
      assert.equal(parseGaugeConfig(null),null);assert.equal(parseGaugeConfig({max_speed:NaN}),null);
      const config=parseGaugeConfig({max_speed:Infinity});assert.equal(config,null);
      const bad=parseGaugeConfig({max_speed:20,hud:{cockpit_controls:true,cockpit_version:2,telemetry_mask:31,max_rpm:0,redline_rpm:999999,fuel_capacity_liters:0,min_temp_c:100,overheat_c:0,critical_c:0}});
      assert.ok(bad.maxRpm>0&&bad.redlineRpm<=bad.maxRpm);assert.ok(bad.minTempC<bad.overheatC&&bad.overheatC<bad.criticalC);assert.equal(bad.fuelCapacityLiters,null);
      const data=projectVehicleTelemetry({...live,speed:NaN,rpm:Infinity,gear:1.2,fuel:NaN,temp:undefined,boost_fraction:NaN},true,1000,1001,parseGaugeConfig(calibrated));
      for(const field of ['speedKph','rpm','gear','fuelLiters','tempC','boostFraction'])assert.equal(data[field],null,field);
      assert.equal(projectVehicleTelemetry({...live,fuel:-5,boost_fraction:2},true,1000,1001,parseGaugeConfig(calibrated)).fuelLiters,0);
      assert.equal(projectVehicleTelemetry({...live,boost_fraction:2},true,1000,1001,parseGaugeConfig(calibrated)).boostFraction,1);
    });
    await t.test('one reference-counted 20 Hz display sampler reads the latest packet, deduplicates and cleans up',()=>{
      const setInterval=window.setInterval,clearInterval=window.clearInterval,scheduled=new Map();let id=0,updates=0;
      window.setInterval=(fn,ms)=>{scheduled.set(++id,{fn,ms});return id;};window.clearInterval=id=>scheduled.delete(id);
      const unsubscribe=telemetry.subscribe(()=>updates++);let first,second;
      try{
        snapshot(base);first=startVehicleTelemetry();second=startVehicleTelemetry();assert.equal(scheduled.size,1);assert.equal([...scheduled.values()][0].ms,1000/HUD_UPDATE_HZ);assert.equal(HUD_UPDATE_HZ,20);
        const before=updates;for(let i=0;i<100;i++)snapshot({...base,speed:i});assert.equal(updates,before,'network writes cannot broadcast to the HUD');
        [...scheduled.values()][0].fn();assert.ok(Math.abs(telemetry.getState().data.speedKph-356.4)<1e-9);assert.equal(updates,before+1);
        [...scheduled.values()][0].fn();assert.equal(updates,before+1,'identical display values are not republished');
        first();assert.equal(scheduled.size,1);first();assert.equal(scheduled.size,1);second();assert.equal(scheduled.size,0);
      }finally{first?.();second?.();unsubscribe();window.setInterval=setInterval;window.clearInterval=clearInterval;}
    });
    await t.test('Rust vehicle_config events are consumed separately and session teardown clears calibration',async()=>{
      const descriptor=Object.getOwnPropertyDescriptor(globalThis,'WebSocket');
      class Socket { static OPEN=1;static CONNECTING=0;readyState=0;bufferedAmount=0;send(){}close(){this.readyState=3;this.onclose?.();} }
      Object.defineProperty(globalThis,'WebSocket',{configurable:true,value:Socket});
      const {connectRustServer,disconnectRustServer}=await load('net/rustSocket.ts');
      try{
        const connection=connectRustServer();connection.readyState=1;connection.onopen();
        connection.onmessage({data:JSON.stringify({type:'vehicle_config',data:{player_id:'other',config:{max_speed:20}}})});
        connection.onmessage({data:JSON.stringify({type:'vehicle_config',data:{player_id:'me',config:calibrated}})});
        assert.equal(configs.getState().byPlayer.me.speedMaxKph,320);assert.equal(configs.getState().byPlayer.other.speedMaxKph,80);
        connection.onmessage({data:JSON.stringify({type:'vehicle_config',data:{player_id:'me',config:{max_speed:0}}})});assert.equal(configs.getState().byPlayer.me.telemetryMask,31);
        disconnectRustServer();assert.deepEqual(configs.getState().byPlayer,{});assert.equal(network.getState().connected,false);
      }finally{disconnectRustServer();if(descriptor)Object.defineProperty(globalThis,'WebSocket',descriptor);else delete globalThis.WebSocket;}
    });
    await t.test('capture context records resources without invalidating every fuel or heat update',async()=>{
      const {experimentContext}=await load('performance/context.ts');
      network.getState().setConnected(true);network.getState().setPlayerId('me');configs.getState().receive('me',calibrated);snapshot(live);
      const before=experimentContext();snapshot({...live,fuel:20,temp:105,condition:.8,boost_fraction:.2,resource_mask:16});const after=experimentContext();
      assert.equal(before.key,after.key);assert.equal(after.settings.playerResources.fuelLiters,20);assert.equal(after.settings.playerResources.condition,.8);
      configs.getState().receive('me',{...calibrated,hud:{...calibrated.hud,fuel_capacity_liters:60}});assert.notEqual(experimentContext().key,after.key);configs.getState().reset();
    });
    const meter=label=>document.querySelector(`[role="meter"][aria-label="${label}"]`);
    const control=label=>document.querySelector(`[aria-label="${label}"]`);
    const pointer=async(label,type,id=1,extra={})=>act(async()=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:id,button:0,clientX:0,clientY:0,...extra});control(label).dispatchEvent(event);});
    await t.test('the three gauge faces show the local player and unit preference without the retired mutation store',async()=>{
      network.getState().setConnected(true);network.getState().setPlayerId('me');snapshot(base);
      root=createRoot(document.getElementById('root'));
      await act(async()=>root.render(h(DrivingHUD)));
      assert.equal(meter('Speed').getAttribute('aria-valuenow'),'36');assert.equal(meter('Engine RPM').getAttribute('aria-valuetext'),'Unavailable');assert.equal(control('Hold NOS boost'),null);assert.equal(meter('Ultimate charge').getAttribute('aria-valuetext'),'Unavailable');
      await act(async()=>{configs.getState().receive('me',calibrated);snapshot(live);updateVehicleTelemetry();});
      assert.equal(meter('Engine RPM').getAttribute('aria-valuenow'),'4250');assert.equal(meter('Fuel').getAttribute('aria-valuenow'),'25');assert.equal(meter('Coolant temperature').getAttribute('aria-valuenow'),'90');assert.equal(control('Hold NOS boost'),null);
      await act(async()=>prefs.getState().update({speedUnit:'mph'}));assert.ok(Math.abs(Number(meter('Speed').getAttribute('aria-valuenow'))-22.3694)<.001);assert.match(meter('Speed').getAttribute('aria-valuetext'),/MPH/);
      assert.equal(JSON.parse(localStorage.getItem('avenlab-preferences-v1')).state.speedUnit,'mph');
      assert.equal(sanitizePreferences({speedUnit:'knots',touchLayout:'bad'}).touchLayout,'pedals');
    });
    await t.test('condition warnings and ABS/TCS lights use confirmed snapshots, while clicks only change requests',async()=>{
      await act(async()=>{inputs.getState().setInput({vehicleMask:VehicleFlags.ENGINE_ON|VehicleFlags.ABS|VehicleFlags.TCS});configs.getState().receive('me',{...calibrated,hud:{...calibrated.hud,telemetry_mask:63}});snapshot({...live,condition:.6,resource_mask:16,vehicle_mask:VehicleFlags.ENGINE_ON|VehicleFlags.ABS|VehicleFlags.TCS});updateVehicleTelemetry();});
      assert.equal(meter('Vehicle condition').getAttribute('aria-valuenow'),'60');assert.equal(document.querySelector('.dashboard-signal'),null);assert.equal(document.querySelector('.radio-vehicle-status').textContent,'REPAIR');
      assert.equal(control('Toggle TCS').getAttribute('aria-pressed'),'true');
      await act(async()=>control('Toggle TCS').click());assert.equal(inputRef.current.vehicleMask&VehicleFlags.TCS,0);
      assert.equal(control('Toggle TCS').getAttribute('aria-pressed'),'true');assert.equal(control('Toggle TCS').getAttribute('aria-busy'),'true');
      await act(async()=>{snapshot({...live,condition:.6,resource_mask:16,vehicle_mask:VehicleFlags.ENGINE_ON|VehicleFlags.ABS,cockpit_mask:(inputRef.current.cockpit_mask&0xc0ffffff)>>>0});updateVehicleTelemetry();});
      assert.equal(control('Toggle TCS').getAttribute('aria-pressed'),'false');assert.equal(control('Toggle TCS').getAttribute('aria-busy'),'false');
      await act(async()=>{control('Toggle TCS').dispatchEvent(new dom.window.KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true,cancelable:true}));control('Toggle TCS').click();});
      assert.ok(inputRef.current.vehicleMask&VehicleFlags.TCS);assert.equal(inputRef.current.brake,0);
    });
    await t.test('simultaneous pedals and steering survive idle device polls and release independently',async()=>{
      control('Steering wheel').getBoundingClientRect=()=>({x:100,y:100,width:100,height:100});
      await pointer('Accelerate','pointerdown',1);await pointer('Steering wheel','pointerdown',2,{clientX:100,clientY:150});await pointer('Brake','pointerdown',3);
      assert.equal(inputRef.current.throttle,1);assert.equal(inputRef.current.steer,-1);assert.equal(inputRef.current.brake,1);
      await act(async()=>inputs.getState().setAnalogFromSource('gamepad',{throttle:0,steer:0,brake:0}));assert.equal(inputRef.current.throttle,1);assert.equal(inputRef.current.steer,-1);
      await pointer('Accelerate','pointerup',99);assert.equal(inputRef.current.throttle,1,'an unrelated pointer cannot release the pedal');
      await pointer('Accelerate','pointerup',1);assert.equal(inputRef.current.throttle,0);assert.equal(inputRef.current.steer,-1);assert.equal(inputRef.current.brake,1);
      await pointer('Steering wheel','lostpointercapture',2);assert.equal(inputRef.current.steer,0);assert.equal(inputRef.current.brake,1);
      await pointer('Brake','pointercancel',3);assert.equal(inputRef.current.brake,0);
    });
    await t.test('keyboard/gamepad/optional touch intent still has independent owners',async()=>{
      await act(async()=>inputs.getState().setAnalogFromSource('keyboard',{throttle:1}));await pointer('Reverse','pointerdown',1);assert.equal(inputRef.current.throttle,1);
      await act(async()=>inputs.getState().releaseInputSource('keyboard'));assert.equal(inputRef.current.throttle,-1);await pointer('Reverse','pointerup',1);
      await act(async()=>inputs.getState().setHeldVehicleFlag('keyboard',VehicleFlags.BOOST,true));await act(async()=>{inputs.getState().setHeldVehicleFlag('touch-actions',VehicleFlags.BOOST,true);inputs.getState().setHeldVehicleFlag('touch-actions',VehicleFlags.BOOST,false);});assert.ok(inputRef.current.vehicleMask&VehicleFlags.BOOST);
      await act(async()=>inputs.getState().releaseInputSource('keyboard'));assert.equal(inputRef.current.vehicleMask&VehicleFlags.BOOST,0);
      await pointer('Accelerate','pointerdown',4);assert.equal(inputRef.current.throttle,1);
      await act(async()=>window.dispatchEvent(new Event('blur')));assert.equal(inputRef.current.throttle,0);
    });
    await t.test('controller layout can hide every touch driving input without erasing keyboard/gamepad intent',async()=>{
      await pointer('Accelerate','pointerdown',1);
      await act(async()=>inputs.getState().setAnalogFromSource('keyboard',{steer:.5}));
      await act(async()=>prefs.getState().update({drivingLayout:'controller',showTouchControls:false,showDriveControls:false}));
      for(const name of ['Accelerate','Reverse','Brake','Steering wheel','Toggle ABS','Toggle TCS'])assert.equal(control(name),null,name);
      assert.equal(inputRef.current.throttle,0);assert.equal(inputRef.current.steer,.5);
      await act(async()=>{inputs.getState().releaseInputSource('keyboard');inputs.getState().setAnalogFromSource('gamepad',{throttle:.6,steer:-.4});});
      assert.equal(inputRef.current.throttle,.6);assert.equal(inputRef.current.steer,-.4);
      assert.ok(meter('Engine RPM'));assert.equal(document.querySelector('.drive-dock-header'),null);assert.equal(document.querySelector('.wheel-turn'),null);
      assert.equal(sanitizePreferences({drivingLayout:'controller'}).showTouchControls,false);
      assert.equal(sanitizePreferences({showTouchControls:'bad'}).showTouchControls,true);
      assert.equal(JSON.parse(localStorage.getItem('avenlab-preferences-v1')).state.showTouchControls,false);
      await act(async()=>{inputs.getState().releaseInputSource('gamepad');prefs.getState().update({drivingLayout:'standard',showTouchControls:true,showDriveControls:true});});
      assert.ok(control('Accelerate'));assert.ok(control('Brake'));
    });
    await t.test('touch layout changes release the old controls and a released throttle stick cannot erase held brakes',async()=>{
      await pointer('Accelerate','pointerdown',1);await act(async()=>prefs.getState().update({touchLayout:'sticks'}));assert.equal(inputRef.current.throttle,0);assert.equal(control('Accelerate'),null);
      for(const name of ['Steering wheel','Acceleration and reverse joystick'])control(name).getBoundingClientRect=()=>({x:100,y:100,width:88,height:88});
      await pointer('Steering wheel','pointerdown',1,{clientX:188,clientY:144});await pointer('Acceleration and reverse joystick','pointerdown',2,{clientX:144,clientY:110});await pointer('Brake','pointerdown',3);
      assert.equal(inputRef.current.steer,1);assert.equal(inputRef.current.throttle,1);assert.equal(inputRef.current.brake,1);
      await pointer('Acceleration and reverse joystick','pointerup',2);assert.equal(inputRef.current.throttle,0);assert.equal(inputRef.current.brake,1);assert.equal(inputRef.current.steer,1);
      await pointer('Steering wheel','pointercancel',1);await pointer('Brake','pointerup',3);assert.equal(inputRef.current.steer,0);assert.equal(inputRef.current.brake,0);
      assert.equal(JSON.parse(localStorage.getItem('avenlab-preferences-v1')).state.touchLayout,'sticks');
    });
    await t.test('pause and inspector navigation release touch input and cannot resume it from a held finger',async()=>{
      await pointer('Steering wheel','pointerdown',1,{clientX:173,clientY:144});
      await act(async()=>ui.setState({overlay:'pause'}));assert.equal(inputRef.current.steer,0);
      await act(async()=>ui.setState({overlay:null}));assert.equal(inputRef.current.steer,0);
      await pointer('Steering wheel','pointerdown',1,{clientX:173,clientY:144});await act(async()=>togglePerformanceDetails());assert.equal(inputRef.current.steer,0);assert.equal(document.querySelector('.driving-hud').hasAttribute('inert'),true);
      await act(async()=>inspector.getState().minimize());assert.equal(inputRef.current.steer,0);
      await pointer('Steering wheel','pointermove',1,{clientX:170,clientY:144});assert.equal(inputRef.current.steer,0);
    });
    await t.test('disconnect releases a captured touch stick and reconnect requires a fresh press',async()=>{
      await pointer('Steering wheel','pointerdown',1,{clientX:188,clientY:144});assert.equal(inputRef.current.steer,1);
      await act(async()=>network.getState().setConnected(false));assert.equal(inputRef.current.steer,0);
      await act(async()=>network.getState().setConnected(true));await pointer('Steering wheel','pointermove',1,{clientX:188,clientY:144});assert.equal(inputRef.current.steer,0);
    });
    await t.test('T disables confirmed traction after speed reactivation even if the old request still says off',async()=>{
      const {Keyboard}=await load('controls/Keyboard.ts');
      await act(async()=>root.render(h(Keyboard)));
      await act(async()=>{
        network.getState().setConnected(true);network.getState().setPlayerId('me');configs.getState().receive('me',calibrated);
        inputs.getState().setAssist(2,false);
        const revision=inputs.getState().input.cockpit_mask&0xff0000;
        snapshot({...live,vehicle_mask:97,cockpit_mask:(192|(2<<4)|revision|(1<<25)|(1<<27))>>>0});
        telemetry.setState({data:{...telemetry.getState().data,signal:'offline',tcsEnabled:false}});
      });
      assert.equal(network.getState().getMe().vehicle_mask&VehicleFlags.TCS,64);assert.equal(inputRef.current.vehicleMask&VehicleFlags.TCS,0);
      await act(async()=>window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'t',code:'KeyT',bubbles:true,cancelable:true})));
      assert.equal(inputRef.current.vehicleMask&VehicleFlags.TCS,0);
      assert.equal((inputRef.current.cockpit_mask>>>4)&3,2);
      await act(async()=>window.dispatchEvent(new dom.window.KeyboardEvent('keyup',{key:'t',code:'KeyT',bubbles:true})));
    });
    assert.equal(TelemetryFields.BOOST,16);assert.equal(DEFAULT_GAUGE_CONFIG.telemetryMask,0);
  }finally{
    if(root)await act(async()=>root.unmount());await server.close();dom.window.close();
    for(const[key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
