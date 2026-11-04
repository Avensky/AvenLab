import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {createServer} from 'vite';import {act,createElement as h} from 'react';import {createRoot} from 'react-dom/client';

test('recovery timers and Mechanic actions use authoritative windows and actor ownership',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map();let vite,root,client;
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 document.hasFocus=()=>true;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
 const hp=(extra={})=>({hp:500,max_hp:500,defeated:false,respawn_remaining_s:0,spawn_protection_s:0,damage_seq:0,kills:0,deaths:0,recovery_window_s:12,disabled_reason:'',revive_cooldown_s:0,...extra});
 const vehicle=(id,x,extra={})=>({id,vehicle_id:'brz',team:'red',room_id:1,position:[x,1,0],rotation:[0,0,0,1],speed:0,health:hp(),...extra});
 try{
  vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}});const load=p=>vite.ssrLoadModule('/src/'+p);
  const {useNetworkStore:network}=await load('store/session/networkStore.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),{useChatStore:chat}=await load('store/chat/chatStore.ts'),{usePreferencesStore:prefs}=await load('store/preferences/preferencesStore.ts'),{useVehicleTelemetryStore:telemetry}=await load('store/telemetry/vehicleTelemetryStore.ts');
  const actions=await load('combat/reviveTargets.ts'),status=await load('combat/recoveryStatus.ts'),{RecoveryCountdown}=await load('combat/RecoveryCountdown.tsx'),{ReviveAction}=await load('combat/ReviveAction.tsx'),{VehicleHealthHUD}=await load('combat/VehicleHealthHUD.tsx');client=await load('net/socialClient.ts');root=createRoot(document.getElementById('root'));
  const me=vehicle('me',0),ally=vehicle('ally',5,{health:hp({hp:0,defeated:true,disabled_reason:'combat',respawn_remaining_s:10})});
  const stage=(world=1,profile='owner',hero='mechanic')=>{network.setState({connected:true,playerId:'me',room_id:world,snapshot:{tick:1,received_at_ms:performance.now(),entities:[{...me,room_id:world},{...ally,room_id:world}]}});social.setState({view:{profile:{id:profile,name:'MECHANIC'},alpha:{active:{hero,world_id:world,team:'red'}},worlds:[]}});ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});};
  stage();
  await t.test('target selection excludes other rooms, enemies, expired windows and moving/downed mechanics',()=>{
   const snapshot={entities:[me,{...ally,id:'far',position:[8.01,1,0]},{...ally,id:'high',position:[1,5.01,0]},{...ally,id:'enemy',team:'blue',position:[1,1,0]},{...ally,id:'otherworld',room_id:2,position:[1,1,0]},{...ally,id:'expired',health:hp({defeated:true,respawn_remaining_s:0})},ally]};
   assert.equal(actions.nearestReviveTarget(snapshot,'me').id,'ally');assert.equal(actions.nearestReviveTarget({...snapshot,entities:[{...me,speed:3.01},ally]},'me'),null);assert.equal(actions.nearestReviveTarget({...snapshot,entities:[{...me,health:hp({defeated:true})},ally]},'me'),null);
   assert.equal(actions.nearestReviveTarget({...snapshot,match_state:{phase:'ended'}},'me'),null);assert.equal(actions.nearestReviveTarget({entities:[me,{...ally,position:[NaN,1,0]}]},'me'),null);
   assert.equal(actions.nearestReviveTarget({entities:[me,{...ally,position:[8,5,0]}]},'me').id,'ally','range and height boundaries are inclusive');
   assert.equal(actions.isMechanicPlayer(),true);social.setState({view:{...social.getState().view,alpha:{active:{hero:'brz',world_id:1,team:'red'}}}});assert.equal(actions.isMechanicPlayer(),false,'a BRZ chassis alone does not grant revive');stage();
  });
  await t.test('downed circles include self despite Hide All, have bounded server progress and no invented legacy window',async()=>{
   const deadMe={...me,health:hp({hp:0,defeated:true,respawn_remaining_s:6,disabled_reason:'fuel'})};assert.deepEqual(status.healthMarkerIds({entities:[deadMe,ally,{...ally,id:'foreign',room_id:9} ]},'me','none'),['me','ally']);
   const half=status.recoveryStatus(deadMe.health);assert.equal(half.progress,.5);assert.equal(half.reason,'fuel');await act(async()=>root.render(h(RecoveryCountdown,{status:half})));assert.equal(document.querySelector('.action-progress-orbit').dataset.progress,'0.5');assert.match(document.querySelector('[role="timer"]').getAttribute('aria-label'),/6 seconds/);
   assert.equal(status.recoveryStatus(hp()),null);assert.equal(status.recoveryStatus(hp({defeated:true,respawn_remaining_s:30})).progress,1);assert.equal(status.recoveryStatus(hp({defeated:true,recovery_window_s:undefined,respawn_remaining_s:5})).progress,null);assert.equal(status.recoveryStatus(hp({defeated:true,respawn_remaining_s:0})).revivable,false);
  });
  await t.test('local disabled feedback remains visible when HP bars are hidden and explains fuel recovery',async()=>{
   stage();await act(async()=>{prefs.getState().update({healthBars:'none'});network.setState({snapshot:{tick:2,received_at_ms:performance.now(),entities:[{...me,health:hp({defeated:true,disabled_reason:'fuel',respawn_remaining_s:7})}]}});telemetry.setState(s=>({data:{...s.data,signal:'live'}}));root.render(h(VehicleHealthHUD));});
   assert.equal(document.querySelector('.vehicle-health-hud'),null);assert.match(document.querySelector('.vehicle-defeated-banner').textContent,/FUEL EMPTY/);assert.match(document.querySelector('.vehicle-defeated-banner').textContent,/mechanic can recover/);assert.equal(document.querySelector('.recovery-countdown').dataset.reason,'fuel');
   await act(async()=>root.render(null));stage();
  });
  const sent=[];client.setSocialConnection({readyState:WebSocket.OPEN,send:body=>sent.push(JSON.parse(body))});stage();const reply=(request,ok=true,message)=>client.receiveSocialResult({request_id:request.request_id,ok,data:{},message});
  await t.test('button requests only the nearest ally and waits for server state rather than changing HP',async()=>{
   await act(async()=>root.render(h(ReviveAction)));const button=document.querySelector('[aria-label="Revive nearby teammate"]');assert.equal(button.disabled,false);let pending;await act(async()=>{pending=actions.requestNearestRevive();});assert.equal(sent.at(-1).action,'vehicle_revive');assert.equal(sent.at(-1).target,'ally');assert.equal(button.disabled,true);assert.equal(await actions.requestNearestRevive(),false,'one request per current actor');
   await act(async()=>reply(sent.at(-1)));assert.equal(await pending,true);assert.equal(network.getState().snapshot.entities[1].health.hp,0,'no browser-authored healing');assert.equal(button.disabled,false);
   await act(async()=>network.setState({snapshot:{...network.getState().snapshot,entities:[{...me,health:hp({revive_cooldown_s:10})},ally]}}));assert.equal(button.disabled,true);assert.equal(button.querySelector('.cooldown-clock').dataset.progress,'0.5');assert.equal(await actions.requestNearestRevive(),false);stage();
  });
  await t.test('late responses from an old actor cannot notify or clear a new worlds pending recovery',async()=>{
   chat.setState({notices:[]});let oldRequest,newRequest;await act(async()=>{oldRequest=actions.requestNearestRevive();});const first=sent.at(-1);await act(async()=>stage(2,'new-owner'));assert.equal(document.querySelector('[aria-label="Revive nearby teammate"]').disabled,false,'old request does not lock new actor');await act(async()=>{newRequest=actions.requestNearestRevive();});const second=sent.at(-1);
   assert.notEqual(first.request_id,second.request_id);await act(async()=>reply(first));assert.equal(await oldRequest,false);assert.equal(chat.getState().notices.length,0);assert.equal(actions.useReviveRequestStore.getState().busy,true);
   await act(async()=>reply(second));assert.equal(await newRequest,true);assert.equal(chat.getState().notices.length,1);assert.equal(actions.useReviveRequestStore.getState().busy,false);
  });
  await t.test('expired targets, unsupported timers and non-mechanics cannot request recovery',async()=>{
   stage();await act(async()=>network.setState({snapshot:{entities:[me,{...ally,health:hp({defeated:true,respawn_remaining_s:0})}]}}));assert.equal(await actions.requestNearestRevive(),false);
   await act(async()=>stage(1,'owner','brz'));assert.equal(document.querySelector('[aria-label="Revive nearby teammate"]'),null);assert.equal(await actions.requestNearestRevive(),false);
   stage();await act(async()=>network.setState({snapshot:{entities:[{...me,health:hp({revive_cooldown_s:undefined})},ally]}}));assert.equal(await actions.requestNearestRevive(),false);
  });
 }finally{client?.setSocialConnection(null);if(root)await act(async()=>root.unmount());await vite?.close();dom.window.close();for(const[key,value]of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});
