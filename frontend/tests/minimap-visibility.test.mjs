import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';

test('minimap team radio shows allies and only enemies detected by living teammates',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map();let vite,root;
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){
  old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 document.hasFocus=()=>true;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
 try{
  vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}});const load=p=>vite.ssrLoadModule('/src/'+p);
  const {minimapContacts:contacts,projectMinimapContact:project,MINIMAP_ALLY_COLOR:blue,MINIMAP_ENEMY_COLOR:orange}=await load('ui/Minimap/minimapContacts.ts');
  const vehicle=(id,team,x,z=0,extra={})=>({id,kind:'car',vehicle_id:'brz',room_id:4,team,position:[x,1,z],rotation:[0,0,0,1],health:{hp:500,defeated:false},...extra});
  const snapshot=entities=>({tick:1,entities});
  await t.test('an ally reveals a distant enemy to the entire team; boundary is inclusive and exits hide immediately',()=>{
   const me=vehicle('me','red',0),ally=vehicle('ally','red',1000),edge=vehicle('edge','blue',1150),outside=vehicle('outside','blue',1150.001),near=vehicle('near','blue',0,150);
   assert.deepEqual(contacts(snapshot([me,ally,edge,outside,near]),'me').map(c=>c.id),['ally','edge','near']);
   edge.position[0]=1151;assert.deepEqual(contacts(snapshot([me,ally,edge]),'me').map(c=>c.id),['ally']);
  });
  await t.test('defeated allies remain visible but cannot detect; dead enemies and other worlds stay hidden',()=>{
   const me=vehicle('me','blue',0),ally=vehicle('ally','blue',1000,0,{health:{hp:0,defeated:true}}),enemy=vehicle('enemy','red',1050),dead=vehicle('dead','red',5,0,{health:{hp:0,defeated:true}}),elsewhere=vehicle('other-world','red',3,0,{room_id:5});
   const found=contacts(snapshot([me,ally,enemy,dead,elsewhere]),'me');assert.deepEqual(found.map(c=>c.id),['ally']);assert.equal(found[0].defeated,true);
   me.health={hp:0,defeated:true};ally.health={hp:500,defeated:false};assert.deepEqual(contacts(snapshot([me,ally,enemy]),'me').map(c=>c.id),['ally','enemy'],'living teammate supplies detection even when self is defeated');
  });
  await t.test('unknown teams, missing local body and nonfinite positions never reveal targets',()=>{
   const me=vehicle('me','red',0),enemy=vehicle('enemy','blue',1);
   assert.deepEqual(contacts(snapshot([me,enemy]),'missing'),[]);assert.deepEqual(contacts(snapshot([{...me,team:undefined},enemy]),'me'),[]);
   assert.deepEqual(contacts(snapshot([me,{...enemy,team:undefined},vehicle('bad','red',NaN),vehicle('infinite','blue',Infinity)]),'me'),[]);
   assert.deepEqual(contacts(snapshot([me,enemy]),'me',NaN),[]);assert.deepEqual(contacts(snapshot([me,enemy]),'me',-1),[]);
   assert.deepEqual(contacts(snapshot([{...me,position:[0,NaN,0]},enemy]),'me'),[]);
  });
  await t.test('far contacts stay inside both map shapes without changing nearby positions',()=>{
   const near={id:'near',side:'ally',defeated:false,x:10,z:20},far={...near,x:1000,z:1000};
   assert.deepEqual(project(near,0,0,600,true),{x:10,z:20,edge:false});
   const circle=project(far,0,0,600,true),square=project(far,0,0,600,false);
   assert(circle.edge);assert(Math.hypot(circle.x,circle.z)<300);assert.deepEqual(square,{x:276,z:276,edge:true});assert.equal(project(far,0,0,0,true),null);
  });
  const {useNetworkStore:network}=await load('store/session/networkStore.ts'),{useMapTelemetryStore:pose}=await load('store/telemetry/mapTelemetry.ts'),{Minimap}=await load('ui/Minimap/Minimap.tsx');
  const me=vehicle('me','red',0),ally=vehicle('ally','red',1000),enemy=vehicle('enemy','blue',1100),hidden=vehicle('hidden','blue',400);
  network.setState({connected:true,playerId:'me',room_id:4,snapshot:{tick:1,received_at_ms:performance.now(),entities:[me,ally,enemy,hidden]}});pose.setState({x:0,z:0,yaw:0});
  root=createRoot(document.getElementById('root'));
  await t.test('actual map renders relationship colours and keeps shared detection while self is stationary',async()=>{
   await act(async()=>root.render(h(Minimap,{forceExpanded:true})));
   const allyDot=document.querySelector('[data-player-id="ally"]'),enemyDot=document.querySelector('[data-player-id="enemy"]');assert(allyDot);assert(enemyDot);assert.equal(allyDot.getAttribute('fill'),blue);assert.equal(enemyDot.getAttribute('fill'),orange);assert.equal(allyDot.dataset.edge,'true');
   assert.equal(document.querySelector('[data-player-id="me"]'),null,'existing arrow owns self');assert.equal(document.querySelector('[data-player-id="hidden"]'),null);
   await act(async()=>network.setState({snapshot:{tick:2,received_at_ms:performance.now(),entities:[me,ally,{...enemy,position:[1200,1,0]},hidden]}}));
   assert.equal(document.querySelector('[data-player-id="enemy"]'),null,'enemy leaves shared detection without needing local movement');assert(document.querySelector('[data-player-id="ally"]'));
  });
  await t.test('carrier rings decorate visible contacts and self without revealing a hidden enemy carrier',async()=>{
   const flags=carriers=>({match_id:'carrier-round',phase:'running',flags:carriers.map(([team,carrier])=>({team,carrier,status:'carried',base:[0,1,0],position:[0,1,0],return_remaining_s:0}))});
   const data={tick:3,received_at_ms:performance.now(),entities:[me,ally,enemy,hidden],match_state:flags([['red','hidden'],['blue','ally']])};
   const found=contacts(data,'me');assert.equal(found.find(c=>c.id==='ally').carryingFlag,'blue');assert.equal(found.find(c=>c.id==='hidden'),undefined);
   await act(async()=>{network.setState({connected:false});network.setState({connected:true,snapshot:data});});
   const allyCarrier=document.querySelector('[data-carrier-id="ally"]');assert(allyCarrier);assert.equal(document.querySelector('[data-carrier-id="hidden"]'),null,'flag metadata must not reveal a distant enemy');
   const ring=allyCarrier.querySelector('.map-carrier-ring'),dot=document.querySelector('[data-player-id="ally"]');assert(ring);assert.equal(ring.getAttribute('cx'),dot.getAttribute('cx'));assert.equal(ring.getAttribute('cy'),dot.getAttribute('cy'));assert.equal(allyCarrier.querySelector('path,rect'),null,'carrier decoration is circular, without an offset box-shaped glyph');assert.equal(dot.getAttribute('fill'),blue,'objective ring preserves relationship colour');
   await act(async()=>{network.setState({connected:false});network.setState({connected:true,snapshot:{...data,match_state:flags([['red','enemy'],['blue','me']])}});});
   assert(document.querySelector('[data-carrier-id="enemy"]'));assert(document.querySelector('[data-self-carrier="true"]'));
   assert.equal(document.querySelector('[data-player-id="me"]'),null,'self has a ring, not a duplicate relationship dot');
   await act(async()=>{network.setState({connected:false});network.setState({connected:true,snapshot:{...data,match_state:{...data.match_state,flags:[]}}});});
   assert.equal(document.querySelectorAll('.map-flag-carrier').length,0,'dropped/returned flags remove carrier decoration');
  });
  await t.test('disconnect, room change and body/world reset remove old contacts immediately inside the display interval',async()=>{
   await act(async()=>network.setState({connected:false}));assert.equal(document.querySelectorAll('[data-player-id]').length,0);
   await act(async()=>network.setState({connected:true,snapshot:{tick:3,received_at_ms:performance.now(),entities:[me,ally]}}));assert(document.querySelector('[data-player-id="ally"]'));
   await act(async()=>network.setState({room_id:5}));assert.equal(document.querySelectorAll('[data-player-id]').length,0,'new room must not use stale old-room snapshots');
   await act(async()=>network.setState({room_id:4}));assert(document.querySelector('[data-player-id="ally"]'));
   await act(async()=>network.setState({snapshot:{tick:4,entities:[ally]}}));assert.equal(document.querySelectorAll('[data-player-id]').length,0,'local body removal clears immediately');
   await act(async()=>network.setState({snapshot:null}));assert.equal(document.querySelectorAll('[data-player-id]').length,0);
  });
  await t.test('GPS follows position, updates a changed destination and clears an out-of-range route',async()=>{
   const {useWorldStore:world}=await load('store/world/worldStore.ts');
   const {useNavigationStore:nav}=await load('store/world/navigationStore.ts');
   await act(async()=>root.render(null));
   const oldInterval=window.setInterval;window.setInterval=()=>0;
   try {
   await act(async()=>root.render(h(Minimap,{forceExpanded:true})));
   const road={id:'straight',kind:'road',center:[0,0,0],half_extents:[200,1,10]};
   await act(async()=>{
    world.setState({map:{collider_chunks:[{boxes:[road]}]}});
    pose.setState({x:0,z:0,yaw:0});
    nav.getState().setDestination({x:100,z:0});
   });
   const path=()=>document.querySelector('.gps-map polyline')?.getAttribute('points')??null;
   assert.equal(path(),'0,0 100,0');
   await act(async()=>pose.setState({yaw:90}));assert.equal(path(),'0,0 100,0');
   await act(async()=>pose.setState({x:20}));assert.equal(path(),'20,0 100,0');
   await act(async()=>nav.getState().setDestination({x:-60,z:0}));assert.equal(path(),'20,0 -60,0');
   await act(async()=>pose.setState({z:90}));assert.equal(path(),null);
   await act(async()=>{pose.setState({z:0});nav.getState().setDestination(null);});assert.equal(path(),null);
   } finally {
    await act(async()=>{root.render(null);world.setState({map:null});nav.getState().setDestination(null);});
    window.setInterval=oldInterval;
   }
  });
  await t.test('map opens once per deployment and round, preserving later collapse and saved size',async()=>{
   const {useHudPanelsStore:panels}=await load('store/hud/hudPanelsStore.ts'),{MinimapSessionLifecycle}=await load('ui/Minimap/MinimapSessionLifecycle.tsx'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),{usePreferencesStore:prefs}=await load('store/preferences/preferencesStore.ts');
   const size=prefs.getState().minimapScale;
   await act(async()=>{root.render(null);panels.setState({map:false,mapSessionKey:null});ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});network.setState({connected:true,playerId:'me',room_id:4,snapshot:{tick:10,entities:[me,ally]}});root.render(h(MinimapSessionLifecycle));});
   assert.equal(panels.getState().map,true);await act(async()=>panels.getState().toggle('map'));assert.equal(panels.getState().map,false);
   await act(async()=>network.setState({snapshot:{tick:11,entities:[me,ally]}}));assert.equal(panels.getState().map,false,'ordinary snapshots do not reopen');
   await act(async()=>{ui.setState({overlay:'pause'});ui.setState({overlay:null});});assert.equal(panels.getState().map,false,'closing a pause menu preserves collapse');
   await act(async()=>network.setState({snapshot:{tick:12,entities:[me,ally],match_state:{match_id:'real-round',phase:'running',flags:[]}}}));assert.equal(panels.getState().map,true,'official round start opens once');
   await act(async()=>panels.getState().toggle('map'));await act(async()=>network.setState({snapshot:{tick:13,entities:[me,ally],match_state:{match_id:'real-round',phase:'running',flags:[]}}}));assert.equal(panels.getState().map,false);
   await act(async()=>{ui.setState({screen:'mode_select'});ui.setState({screen:'sandbox'});});assert.equal(panels.getState().map,true,'fresh deployment reopens');assert.equal(prefs.getState().minimapScale,size,'opening is not a saved scale preference change');
  });
 }finally{if(root)await act(async()=>root.unmount());await vite?.close();dom.window.close();for(const[key,value]of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});
