import test from 'node:test';import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';import {createServer} from 'vite';import {createElement as h,act,Profiler} from 'react';import {createRoot} from 'react-dom/client';

test('futuristic HUD mixes with classic gauges and filters teammate resources',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),originals=new Map();let root,server;
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
 try{
  server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});const load=p=>server.ssrLoadModule('/src/'+p);
  const {usePreferencesStore:prefs,sanitizePreferences}=await load('store/preferences/preferencesStore.ts'),{useNetworkStore:network}=await load('store/session/networkStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts');
  const {useVehicleTelemetryStore:telemetry,updateVehicleTelemetry}=await load('store/telemetry/vehicleTelemetryStore.ts'),{useVehicleConfigStore:configs,DEFAULT_GAUGE_CONFIG}=await load('store/session/vehicleConfigStore.ts');
  const {FuturisticHUD}=await load('ui/FuturisticHUD/FuturisticHUD.tsx'),{VehicleHealthHUD}=await load('combat/VehicleHealthHUD.tsx'),{TeammateHUD}=await load('ui/FuturisticHUD/TeammateHUD.tsx'),{HudGroup}=await load('ui/HudGroup.tsx');
  const {BarrageTrigger}=await load('combat/BarrageTrigger.tsx');
  const {readTeammates}=await load('ui/FuturisticHUD/teammateModel.ts');
  const {resourceReadings,combatHealth,engineHeatBand}=await load('ui/FuturisticHUD/resourceModel.ts');
  assert.deepEqual([null,40,85,105,110,130].map(v=>engineHeatBand(v,DEFAULT_GAUGE_CONFIG)),['unknown','cool','normal','warm','hot','critical']);
  assert.equal(engineHeatBand(99,{minTempC:20,overheatC:99,criticalC:101}),'hot');
  const clean=sanitizePreferences({hudGroups:{gauges:false,futuristic:true,teammates:false,shifter:false}});assert.equal(clean.hudGroups.futuristic,true);assert.equal(clean.hudGroups.gauges,false);assert.equal(clean.hudGroups.teammates,false);assert.equal(clean.hudGroups.shifter,false);
  ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});network.setState({playerId:'me',connected:true});
  const health={hp:850,max_hp:1200,defeated:false,respawn_remaining_s:0,spawn_protection_s:0,damage_seq:0,last_attacker:null,last_damage:0,last_damage_kind:'',kills:0,deaths:0};
  const me={id:'me',kind:'tank',vehicle_id:'tank',room_id:2,team:'blue',position:[0,1,0],rotation:[0,0,0,1],speed:20,rpm:3000,gear:3,fuel:25,temp:90,telemetry_mask:127,boost_fraction:.75,condition:.1,ultimate_fraction:.72,vehicle_mask:1,player_mask:0,health};
  const ally={...me,id:'ally',vehicle_id:'ae86',health:{...health,hp:300,max_hp:500}},enemy={...me,id:'enemy',team:'red'},other={...me,id:'other',room_id:3};
  configs.setState({byPlayer:{me:{...DEFAULT_GAUGE_CONFIG,fuelCapacityLiters:50,telemetryMask:127}}});let tick=0;
  const send=()=>{network.getState().setSnapshot({tick:++tick,entities:[me,ally,enemy,other]},performance.now());updateVehicleTelemetry();};send();
  assert.deepEqual(readTeammates().map(row=>row.id),['ally']);assert.equal(readTeammates(performance.now()+1000).length,1,'stale roster keeps teammate portraits');assert.equal(readTeammates(performance.now()+1000)[0].health,null,'stale teammate HP is unknown');
  let dockCommits=0;
  root=createRoot(document.getElementById('root'));await act(async()=>{prefs.getState().update({hudGroups:{futuristic:true,gauges:true}});root.render(h('div',{className:'driving-hud'},h(HudGroup,{id:'gauges',title:'classic'},h('div',{id:'classic-test'},'CLASSIC')),h(HudGroup,{id:'futuristic',title:'future'},h(Profiler,{id:'instruments',onRender:()=>dockCommits++},h(FuturisticHUD))),h(TeammateHUD),h(VehicleHealthHUD),h(BarrageTrigger,{tile:true})));});
  await act(async()=>send()); // Start with a fresh snapshot after concurrent fixture initialization.
  const meter=label=>document.querySelector(`[aria-label="${label}"][role="meter"]`);
  assert(document.getElementById('classic-test'));assert(document.querySelector('.futuristic-hud'));assert.equal(meter('HULL HP').getAttribute('aria-valuetext'),'850 / 1200','HP stays separate from condition');assert.equal(meter('FUEL').getAttribute('aria-valuenow'),'50');assert.equal(meter('NITROUS').getAttribute('aria-valuenow'),'75');assert.equal(document.querySelector('.vehicle-health-hud'),null,'no duplicate self HP');
  assert.equal(document.querySelector('.future-condition'),null);
  assert.equal(document.querySelector('.future-engine b').textContent,'194°F');
  assert.equal(document.querySelectorAll('.future-assists button .assist-bulb').length,3);
  assert.equal(document.querySelector('.future-assists').querySelectorAll('button').length,3);
  assert(document.querySelector('.future-fuel-row').contains(meter('FUEL')));
  assert.equal(meter('NITROUS').querySelector('output').textContent,'75%');
  assert.equal(document.querySelectorAll('.teammate-hud li').length,1);assert(document.querySelector('.teammate-hud img').getAttribute('src').endsWith('ae86.webp'));
  await act(async()=>prefs.getState().update({hudGroups:{gauges:false}}));assert.equal(document.getElementById('classic-test'),null);assert(meter('HULL HP'));
  for(const [value,text,ready] of [[0,'0%',false],[.25,'25%',false],[.5,'50%',false],[.72,'72%',false],[.999,'99%',false],[1,'100%',true],[0,'0%',false]]) {
   await act(async()=>{me.ultimate_fraction=value;send();});
   const charge=meter('Ultimate charge');assert.equal(charge.getAttribute('aria-valuetext'),text);
   assert.equal(charge.parentElement.dataset.charged,String(ready));
   const tile=document.querySelector('.barrage-action');
   assert.equal(tile.disabled,!ready);
   assert.equal(tile.querySelector('.cooldown-clock').dataset.ready,String(ready));
   for(const [meter,track] of [[charge,'M50 3H90L97 10V90L90 97H10L3 90V10L10 3Z'],[tile,'M50 4A46 46 0 0 1 50 96']]) {
    for(const stroke of meter.querySelectorAll('.charge-outer,.charge-inner')){
     assert.equal(stroke.getAttribute('d'),track,'each fill follows its full calibrated track');
     assert(Math.abs(Number(stroke.getAttribute('stroke-dashoffset'))-(1-parseInt(text,10)/100))<1e-6);
    }
    assert.equal(meter.querySelector('.charge-inner').getAttribute('transform'),meter===charge?'translate(94 6) scale(-.88 .88)':'translate(100 0) scale(-1 1)');
   }
  }
  await act(async()=>{me.barrage={ticks_left:180};send();});
  const activeCharge=meter('Ultimate charge');
  assert.equal(activeCharge.parentElement.dataset.ultimateActive,'true');
  assert.equal(activeCharge.querySelector('strong').textContent,'ACTIVE');
  assert.match(activeCharge.getAttribute('aria-valuetext'),/Ultimate active/);
  await act(async()=>{me.barrage={ticks_left:0};send();});
  assert.equal(activeCharge.parentElement.dataset.ultimateActive,'false');
  assert.equal(activeCharge.querySelector('strong').textContent,'0%');
  const paint={body:'factory',finish:'factory',seats:'factory',skin:'factory'};
  await act(async()=>{me.appearance=paint;send();});
  const stable=dockCommits;
  for(let i=0;i<6;i++) await act(()=>{me.appearance={...paint};me.position=[i,1,0];send();});
  assert.equal(dockCommits,stable,'pose packets and equal paint values do not redraw the instruments');
  await act(()=>{me.appearance={...paint,body:'#6699aa'};send();});
  assert(dockCommits>stable,'a changed paint still updates the portrait');
  await act(async()=>prefs.getState().update({healthBars:'none'}));assert.equal(meter('HULL HP'),null);assert.equal(document.querySelector('.teammate-health'),null);assert(meter('FUEL'));
  await act(async()=>prefs.getState().update({healthBars:'all',speedUnit:'mph'}));assert.equal(document.querySelector('.future-driving strong').textContent,'45');
  await act(async()=>{me.health={...health,hp:0,defeated:true,respawn_remaining_s:3};send();});assert(document.querySelector('.vehicle-defeated-banner'));assert.match(document.querySelector('.future-status').textContent,/DISABLED/);assert.equal(document.querySelector('.futuristic-hud .future-status'),null,'status notices do not add a console grid row');
  await act(async()=>{network.setState(s=>({snapshot:{...s.snapshot,received_at_ms:performance.now()-1000}}));updateVehicleTelemetry();});assert.equal(meter('FUEL').getAttribute('aria-valuetext'),'—');assert.equal(meter('HULL HP').getAttribute('aria-valuetext'),'—');assert.equal(meter('Ultimate charge').getAttribute('aria-valuenow'),null);assert(document.querySelector('.barrage-action [aria-label="Ultimate charge unavailable"]'));
  assert.equal(resourceReadings({...telemetry.getState().data,signal:'live',fuelLiters:20,config:{...DEFAULT_GAUGE_CONFIG,fuelCapacityLiters:0}}).fuel,null);assert.equal(combatHealth({...me,health:{...health,max_hp:0}}),null);
  await act(async()=>{me.health=health;send();prefs.getState().update({hudGroups:{futuristic:false,gauges:true}});});assert.equal(document.querySelector('.futuristic-hud'),null);assert.equal(document.querySelector('.vehicle-health-hud'),null,'retired hull overlay never returns');
  await act(async()=>network.setState({connected:false}));assert.equal(readTeammates().length,0);
 }finally{if(root)await act(async()=>root.unmount());await server?.close();dom.window.close();for(const[key,value]of originals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
