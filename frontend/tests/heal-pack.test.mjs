import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';

test('Mechanic assisted packs use primary fire without aiming and never author damage or healing',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true}),old=new Map(),frames=new Map();let serial=0,vite,root,client,transport;
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),IS_REACT_ACT_ENVIRONMENT:true})){
  old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 const socketDescriptor=Object.getOwnPropertyDescriptor(globalThis,'WebSocket');
 class Socket{static OPEN=1;static CONNECTING=0;readyState=1;bufferedAmount=0;sent=[];send(body){this.sent.push(JSON.parse(body));}close(){this.readyState=3;this.onclose?.();}}
 Object.defineProperty(globalThis,'WebSocket',{value:Socket,writable:true,configurable:true});document.hasFocus=()=>true;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
 const pad={connected:true,index:0,id:'heal-pad',axes:[0,0,0,0],buttons:Array.from({length:18},()=>({pressed:false,value:0}))};navigator.getGamepads=()=>[pad];
 const poll=()=>act(async()=>{const[id,fn]=frames.entries().next().value;frames.delete(id);fn(performance.now());});
 const press=async(index,held)=>{pad.buttons[index]={pressed:held,value:Number(held)};await poll();};
 try{
  vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},cacheDir:'node_modules/.vite-heal-pack-tests'});const load=path=>vite.ssrLoadModule('/src/'+path);
  const {useNetworkStore:network}=await load('store/session/networkStore.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts');
  const {useCombatStore:combat,combatIntent}=await load('combat/combatStore.ts'),{useInputStore:input}=await load('store/input/inputStore.ts'),{usePreferencesStore:prefs}=await load('store/preferences/preferencesStore.ts');
  const actions=await load('combat/healPackTargets.ts'),{visibleHealthPack}=await load('combat/healthPackVisuals.ts'),{HealPackAction}=await load('combat/HealPackAction.tsx');
  const {Keyboard}=await load('controls/Keyboard.ts'),{GameController}=await load('controls/GameController.ts'),{CombatHUD}=await load('combat/CombatHUD.tsx'),{sendInputPacket}=await load('net/inputSender.ts'),{requestWeaponFire}=await load('combat/turretControls.ts');
  client=await load('net/socialClient.ts');transport=await load('net/rustSocket.ts');const socket=transport.connectRustServer();client.setSocialConnection(socket);root=createRoot(document.getElementById('root'));
  const hp=(extra={})=>({hp:500,max_hp:500,defeated:false,respawn_remaining_s:0,spawn_protection_s:0,damage_seq:0,kills:0,deaths:0,revive_cooldown_s:0,...extra});
  const vehicle=(id,x,extra={})=>({id,kind:'vehicle',vehicle_id:'brz',team:'red',room_id:1,position:[x,1,0],rotation:[0,0,0,1],speed:0,rpm:1000,gear:1,fuel:20,temp:85,vehicle_mask:1,player_mask:0,health:hp(),support:{cooldown_s:0,sequence:0,pack:null},...extra});
  let actor=vehicle('me',0),ally=vehicle('ally',8,{health:hp({hp:250})}),tick=0;
  const stage=(id='me',hero='mechanic',extras={})=>{
   actor=vehicle(id,0,{vehicle_id:hero==='mechanic'?'fortuner':'brz',...extras});ally=vehicle('ally',8,{health:hp({hp:250})});
   social.setState({view:{profile:{id:'profile-'+id,name:'Mechanic'},worlds:[{id:1,members:[{player_id:'ally',name:'ALLY DRIVER'}]}],alpha:{active:{mode:'quickplay',hero,world_id:1,team:'red'}}}});
   network.setState({connected:true,playerId:id,room_id:1});network.getState().setSnapshot({tick:++tick,entities:[actor,ally]},performance.now());ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});combat.getState().setEnabled(false);
  };
  const requestPackets=()=>socket.sent.filter(packet=>packet.action==='vehicle_heal_pack');
  const reply=async(request,ok=true)=>act(async()=>client.receiveSocialResult({request_id:request.request_id,ok,data:{launched:ok,target:'ally',cooldown_s:1.25},message:ok?undefined:'No clear line of sight.'}));
  const key=async(type,code)=>act(async()=>window.dispatchEvent(new window.KeyboardEvent(type,{code,bubbles:true,cancelable:true})));
  await act(async()=>stage());
  await t.test('preview chooses nearest living injured ally, with boundaries and deterministic ties',()=>{
   const candidates=[actor,vehicle('full',1),vehicle('enemy',2,{team:'blue',health:hp({hp:100})}),vehicle('foreign',2,{room_id:9,health:hp({hp:100})}),vehicle('downed',2,{health:hp({hp:0,defeated:true})}),vehicle('far',30.01,{health:hp({hp:100})}),vehicle('high',2,{position:[2,7.01,0],health:hp({hp:100})}),ally];
   assert.equal(actions.nearestHealPackTarget({entities:candidates},actor.id).id,'ally');
   assert.equal(actions.nearestHealPackTarget({entities:[actor,vehicle('boundary',30,{position:[30,7,0],health:hp({hp:100})})]},actor.id).id,'boundary');
   assert.equal(actions.nearestHealPackTarget({entities:[actor,{...ally,id:'z'},{...ally,id:'a'}]},actor.id).id,'a');
   assert.equal(actions.nearestHealPackTarget({entities:[actor,{...ally,position:[NaN,1,0]}]},actor.id),null);
   assert.equal(actions.nearestHealPackTarget({entities:candidates,match_state:{phase:'ended'}},actor.id),null);
  });
  await t.test('one auto-target request sends no target or healing amount and cannot mutate ally HP',async()=>{
   let pending;await act(async()=>{pending=actions.requestAssistedHealPack();});const request=requestPackets().at(-1);
   assert(request);assert.equal(request.target,undefined);assert.equal(request.hp,undefined);assert.equal(request.healing,undefined);assert.equal(await actions.requestAssistedHealPack(),false,'in-flight request is deduplicated');
   await reply(request);assert.equal(await pending,true);assert.equal(network.getState().snapshot.entities[1].health.hp,250);assert.equal(await actions.requestAssistedHealPack(),false,'ACK cannot race a still-zero cooldown snapshot');
  });
  await t.test('keyboard and RB send assisted packs while the mounted turret can aim',async()=>{
   await act(async()=>{stage('keyboard');root.render(h('div',null,h(Keyboard),h(GameController),h(CombatHUD)));});await poll();
   const before=requestPackets().length;await key('keydown',prefs.getState().bindings.fire);assert.equal(combatIntent.keyboardFire,true);sendInputPacket();assert.equal(requestPackets().length,before+1);assert.equal(socket.sent.at(-1).combat.fire,false);assert.equal(socket.sent.at(-1).combat.enabled,true);await reply(requestPackets().at(-1));await key('keyup',prefs.getState().bindings.fire);assert.equal(combatIntent.keyboardFire,false);
   await act(async()=>stage('gamepad'));await poll();const count=requestPackets().length;await press(5,true);assert.equal(combatIntent.gamepadFire,true);sendInputPacket();assert.equal(requestPackets().length,count+1);assert.equal(socket.sent.at(-1).combat.fire,false);assert.equal(input.getState().input.playerMask&1,0,'RB does not also honk');await reply(requestPackets().at(-1));await press(5,false);assert.equal(combatIntent.gamepadFire,false);
   await act(async()=>stage('tap'));assert.equal(requestWeaponFire(),true);const tap=requestPackets().at(-1);assert(tap);await reply(tap);
  });
  await t.test('HUD uses server cooldown/target feedback, holds through reload, and clears on menu or blur',async()=>{
   await act(async()=>{stage('pointer');root.render(h('div',null,h(CombatHUD),h(HealPackAction)));});const button=document.querySelector('[aria-label="Launch assisted health pack"]');assert(button);assert.match(button.textContent,/ALLY DRIVER/);assert.match(button.textContent,/250 \/ 500 HP/);
   const pointer=new window.MouseEvent('pointerdown',{bubbles:true,button:0});Object.defineProperty(pointer,'pointerId',{value:1});await act(async()=>button.dispatchEvent(pointer));assert.equal(combatIntent.fire,true);await reply(requestPackets().at(-1));
   await act(async()=>network.getState().setSnapshot({tick:++tick,entities:[{...actor,support:{cooldown_s:.75,sequence:1,pack:null}},ally]},performance.now()));assert.equal(button.disabled,false,'reload does not release a held support trigger');assert.equal(button.dataset.ready,'false');
   await act(async()=>ui.setState({overlay:'pause'}));assert.equal(combatIntent.fire,false);assert.equal(document.querySelector('[aria-label="Launch assisted health pack"]'),null);
   await act(async()=>ui.setState({overlay:null}));combatIntent.fire=true;await act(async()=>window.dispatchEvent(new window.Event('blur')));assert.equal(combatIntent.fire,false);
  });
  await t.test('self health, fuel and match changes reactively disable the button without a parent rerender',async()=>{
   await act(async()=>{stage('reactivity');root.render(h(HealPackAction));});
   const button=document.querySelector('[aria-label="Launch assisted health pack"]');assert(button&&!button.disabled);assert.equal(button.dataset.ready,'true');
   const snapshot=extra=>network.getState().setSnapshot({tick:++tick,entities:[{...actor,...extra},ally]},performance.now());
   await act(async()=>snapshot({health:hp({defeated:true})}));assert.equal(button.disabled,true);assert.equal(button.dataset.ready,'false');assert.match(button.querySelector('output').textContent,/^DISABLED$/);
   await act(async()=>snapshot({}));assert.equal(button.disabled,false);assert.equal(button.dataset.ready,'true');
   await act(async()=>snapshot({health:hp({hp:0})}));assert.equal(button.disabled,true);assert.match(button.querySelector('output').textContent,/^DISABLED$/,'zero HP blocks even before the defeated bit arrives');
   await act(async()=>snapshot({fuel:.1}));assert.equal(button.disabled,true);assert.match(button.querySelector('output').textContent,/^LOW FUEL$/);
   await act(async()=>network.getState().setSnapshot({tick:++tick,entities:[actor,ally],match_state:{phase:'ended'}},performance.now()));assert.equal(button.disabled,true);assert.match(button.querySelector('output').textContent,/^DISABLED$/);
  });
  await t.test('old responses cannot unlock another actor and role/world/stale/dead/resource gates stay closed',async()=>{
   await act(async()=>stage('old'));let previous;await act(async()=>{previous=actions.requestAssistedHealPack();});const oldRequest=requestPackets().at(-1);
   await act(async()=>stage('new'));let current;await act(async()=>{current=actions.requestAssistedHealPack();});const newRequest=requestPackets().at(-1);await reply(oldRequest);assert.equal(await previous,false);assert.equal(actions.useHealPackRequestStore.getState().busy,true);await reply(newRequest);assert.equal(await current,true);
   for(const[id,hero,extra]of [['dps','brz',{}],['dead','mechanic',{health:hp({hp:0,defeated:true})}],['fuel','mechanic',{fuel:.1}],['cooldown','mechanic',{support:{cooldown_s:.1,sequence:0,pack:null}}],['old-server','mechanic',{support:undefined}]]){await act(async()=>stage(id,hero,extra));assert.equal(await actions.requestAssistedHealPack(),false,id);}
   await act(async()=>stage('wrongworld'));social.setState({view:{...social.getState().view,alpha:{active:{hero:'mechanic',world_id:9,team:'red'}}}});assert.equal(await actions.requestAssistedHealPack(),false);
   await act(async()=>stage('stale'));network.setState({snapshot:{...network.getState().snapshot,received_at_ms:performance.now()-1200}});assert.equal(await actions.requestAssistedHealPack(),false);
  });
  await t.test('world effects require real server sequence, valid flight state and the current world',()=>{
   const pack={seq:1,target:'ally',origin:[0,1,0],position:[3,1,0],target_position:[8,1,0],remaining_s:.3,duration_s:.5,state:'flying',healed_hp:0};
   assert.equal(visibleHealthPack({...actor,support:{cooldown_s:1,sequence:1,pack}},1),pack);assert.equal(visibleHealthPack({...actor,room_id:9,support:{pack}},1),null);assert.equal(visibleHealthPack({...actor,support:{pack:{...pack,position:[NaN,1,0]}}},1),null);assert.equal(visibleHealthPack({...actor,support:undefined},1),null);
  });
 }finally{client?.setSocialConnection(null);if(root)await act(async()=>root.unmount());transport?.disconnectRustServer();await vite?.close();dom.window.close();if(socketDescriptor)Object.defineProperty(globalThis,'WebSocket',socketDescriptor);else delete globalThis.WebSocket;for(const[key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
