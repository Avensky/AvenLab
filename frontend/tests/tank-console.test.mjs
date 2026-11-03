import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {createServer} from 'vite';import {act,createElement as h} from 'react';import {createRoot} from 'react-dom/client';
test('tank console uses authoritative gauges, gear slots, cooldowns and shared HUD visibility',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map();let server,root;
 for(const [k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,HTMLCanvasElement:dom.window.HTMLCanvasElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true})){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});}
 document.hasFocus=()=>true;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
 try{
  server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});const load=p=>server.ssrLoadModule('/src/'+p);
  const {useCombatStore:combat,combatIntent}=await load('combat/combatStore.ts');const {syncTurretOrientation}=await load('combat/turretControls.ts');const {useNetworkStore:network}=await load('store/session/networkStore.ts');const {useUIStore:ui}=await load('store/menus/uiStore.ts');const {usePreferencesStore:prefs}=await load('store/preferences/preferencesStore.ts');const {parseGaugeConfig,useVehicleConfigStore:configs}=await load('store/session/vehicleConfigStore.ts');const {useVehicleTelemetryStore:telemetry,updateVehicleTelemetry}=await load('store/telemetry/vehicleTelemetryStore.ts');const {DrivingHUD}=await load('ui/DrivingHUD.tsx');const {ClimatePanel}=await load('ui/Cockpit/ClimatePanel.tsx');const {CooldownClock}=await load('combat/CooldownClock.tsx');const {cooldownProgress}=await load('combat/weaponCooldown.ts');const {GearSelector}=await load('ui/Cockpit/mechanical/GearSelector.tsx');const {manualShiftPattern}=await load('ui/Cockpit/mechanical/shiftPattern.ts');
  ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});prefs.getState().update({showDriveControls:true,showTouchControls:true,speedUnit:'kmh',hudGroups:{climate:true,display:false,turret:true,shifter:true,minimap:false}});combat.getState().setEnabled(true);
  const config={max_speed:30,hud:{max_rpm:4200,redline_rpm:3800,forward_gears:6,cockpit_controls:true,cockpit_version:8,telemetry_mask:63,fuel_capacity_liters:1100}};
  const entity={id:'tank',vehicle_id:'tank',rotation:[0,0,0,1],position:[0,1,0],vehicle_mask:1,player_mask:0,speed:20,rpm:3200,gear:4,telemetry_mask:63,fuel:1000,temp:80,cockpit_mask:0,combat:{enabled:true,weapon:'cannon',role:'tank',yaw:Math.PI,pitch:.1,reload:1.5,cannon_reload:1.5,coax_reload:0}};
  network.setState({playerId:'tank',connected:true});configs.getState().receive('tank',config);network.getState().setSnapshot({tick:1,entities:[entity]},performance.now());updateVehicleTelemetry();root=createRoot(document.getElementById('root'));
  await t.test('server calibration draws a tank speed face, RPM range and six real forward slots',async()=>{
   assert.equal(parseGaugeConfig(config).forwardGears,6);await act(async()=>root.render(h(DrivingHUD)));
   assert.equal(document.querySelector('[aria-label="Speed"]').getAttribute('aria-valuemax'),'120');assert.equal(document.querySelector('[aria-label="Engine RPM"]').getAttribute('aria-valuemax'),'4500');
   assert.equal(document.querySelector('[aria-label="Gear selector"]').dataset.forwardGears,'6');assert.equal(document.querySelectorAll('[aria-label^="Select gear "]').length,6);assert.equal(document.querySelectorAll('[aria-label="Select reverse"]').length,1);
   assert(document.querySelector('.hud-drive-turret-stack .hud-shifter'));assert(document.querySelector('.hud-drive-turret-stack .turret-touch-controls'));assert.equal(document.querySelector('.wheel-stage .turret-touch-controls'),null);assert.equal(document.querySelector('.driving-dashboard .turret-instruments'),null);
  });
  await t.test('world HUD opens vehicle editor without a pause-menu entry',async()=>{
   const {useSocialStore:social}=await load('store/social/socialStore.ts');const {useBuilderStore:builder}=await load('worldBuilder/state/builderStore.ts');
   await act(async()=>social.setState({view:{alpha:{active:{mode:'editor',hero:'tank'}}}}));
   const button=document.querySelector('.driving-hud .world-edit-tools button');assert.equal(button.textContent,'EDIT VEHICLE');await act(async()=>button.click());assert.equal(ui.getState().overlay,'world_builder');assert.equal(builder.getState().workspace,'vehicle');
   await act(async()=>{ui.setState({overlay:null});social.setState({view:null});});
  });
  await t.test('Ram expands the tank speed scale during the burst',async()=>{
   entity.combat.ram_remaining=4;await act(async()=>network.getState().setSnapshot({tick:2,entities:[{...entity,combat:{...entity.combat}}]},performance.now()));assert.equal(document.querySelector('[aria-label="Speed"]').getAttribute('aria-valuemax'),'300');
   entity.combat.ram_remaining=0;await act(async()=>network.getState().setSnapshot({tick:3,entities:[{...entity,combat:{...entity.combat}}]},performance.now()));
  });
  await t.test('visibility changes hide turret and shifter independently',async()=>{
   await act(async()=>prefs.getState().setHudGroup('turret',false));assert.equal(document.querySelector('.drive-dock .turret-touch-controls'),null);assert(document.querySelector('.hud-shifter'));
   await act(async()=>{prefs.getState().setHudGroup('turret',true);prefs.getState().setHudGroup('shifter',false);});assert.equal(document.querySelector('.hud-shifter'),null);assert(document.querySelector('.drive-dock .turret-touch-controls'));
  });
  await t.test('climate owns turret status in compact and full modes',async()=>{
   for(const size of ['compact','full']){await act(async()=>root.render(h(ClimatePanel,{size})));assert.match(document.querySelector('.climate-panel .turret-instruments').textContent,/TURRET.*ELEV.*LOAD/);}
  });
  await t.test('both weapon clocks reflect server cooldown while holstered',async()=>{
   assert.equal(cooldownProgress(1.5,3),.5);assert.equal(cooldownProgress(undefined,3),null);
   await act(async()=>root.render(h('div',null,h(CooldownClock,{weapon:'cannon'}),h(CooldownClock,{weapon:'coax'}))));
   const clocks=document.querySelectorAll('.cooldown-clock');assert.equal(clocks[0].dataset.progress,'0.5');assert.equal(clocks[0].querySelector('.action-orbit-fill').getAttribute('stroke-dashoffset'),'0.5');assert.equal(clocks[1].dataset.ready,'true');
  });
  await t.test('manual gates and knob patterns draw only advertised gears',async()=>{
   assert.equal(manualShiftPattern(4).filter(s=>s.gear>0&&s.gear<7).length,4);await act(async()=>root.render(h(GearSelector,{gear:1,automatic:false,disabled:false,pending:false,gearCount:4})));
   assert.equal(document.querySelectorAll('[aria-label^="Select gear "]').length,4);assert.equal(document.querySelector('[aria-label="Select gear 5"]'),null);assert.equal(document.querySelector('.shift-knob-pattern').textContent.includes('6'),false);
  });
  await t.test('angle lock holds sideways bearing/elevation and reset-forward is separate',async()=>{
   const {toggleTurretOrientationLock,resetTurretOrientation}=await load('combat/turretControls.ts');
   combat.getState().setOrientationLocked(false);
   const current=network.getState().getMe();current.rotation=[0,0,0,1];current.combat.yaw=Math.PI/2;current.combat.pitch=.1;
   assert(toggleTurretOrientationLock());syncTurretOrientation([0,0,0,1]);assert(Math.abs(combatIntent.yaw-Math.PI/2)<.001);assert(Math.abs(combatIntent.pitch-.1)<.001);
   syncTurretOrientation([0,Math.SQRT1_2,0,Math.SQRT1_2]);assert(Math.abs(Math.abs(combatIntent.yaw)-Math.PI)<.001);assert(Math.abs(combatIntent.pitch-.1)<.001);
   assert(resetTurretOrientation());assert.equal(combat.getState().orientationLocked,false);assert(Math.abs(Math.abs(combatIntent.yaw)-Math.PI)<.001);assert(Math.abs(combatIntent.pitch)<.001);
  });
  await t.test('tank turret controls auto-enable once on entry and respect a manual stop',async()=>{
   const {CombatHUD}=await load('combat/CombatHUD.tsx');await act(async()=>{combat.getState().setEnabled(false);root.render(h(CombatHUD));});assert.equal(combat.getState().enabled,true);
   await act(async()=>combat.getState().setEnabled(false));await act(async()=>root.render(null));await act(async()=>root.render(h(CombatHUD)));assert.equal(combat.getState().enabled,false,'opening an overlay must not undo Stop Turret Test');
   await act(async()=>window.dispatchEvent(new window.CustomEvent('avenlab:vehicle-entered',{detail:{vehicle:'tank'}})));assert.equal(combat.getState().enabled,true,'a fresh tank spawn starts controls ON even after a manual stop');
   await act(async()=>network.setState({snapshot:{entities:[{...entity,vehicle_id:'brz'}]}}));await act(async()=>network.setState({snapshot:{entities:[entity]}}));assert.equal(combat.getState().enabled,true,'entering another tank enables factory controls');
   await act(async()=>{ui.setState({screen:'main'});root.render(null);});await act(async()=>{ui.setState({screen:'sandbox'});root.render(h(CombatHUD));});assert.equal(combat.getState().enabled,true,'re-entering the same tank after leaving the world enables it again');
  });

 }finally{if(root)await act(async()=>root.unmount());await server?.close();dom.window.close();for(const[k,v]of old)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}
});
