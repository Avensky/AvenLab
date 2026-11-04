import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';

test('hero support abilities route through confirmed roles without stealing drive or firing controls',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true}),old=new Map(),frames=new Map();let serial=0,vite,root,client;
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),IS_REACT_ACT_ENVIRONMENT:true})){
  old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 document.hasFocus=()=>true;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
 const pad={connected:true,index:0,id:'support-guard-pad',axes:[0,0,0,0],buttons:Array.from({length:18},()=>({pressed:false,value:0}))};navigator.getGamepads=()=>[pad];
 const poll=()=>act(async()=>{const[id,fn]=frames.entries().next().value;frames.delete(id);fn(performance.now());});
 const press=async(index,held)=>{pad.buttons[index]={pressed:held,value:Number(held)};await poll();};
 try{
  vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},cacheDir:'node_modules/.vite-support-guard-controls-tests'});const load=path=>vite.ssrLoadModule('/src/'+path);
  const {useNetworkStore:network}=await load('store/session/networkStore.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),{usePreferencesStore:prefs}=await load('store/preferences/preferencesStore.ts');
  const {useCombatStore:combat,combatIntent,tankFireInputs}=await load('combat/combatStore.ts'),{useInputStore:input}=await load('store/input/inputStore.ts'),{VehicleFlags}=await load('store/input/protocol/inputMasks.ts');
  const {Keyboard}=await load('controls/Keyboard.ts'),{GameController}=await load('controls/GameController.ts'),{DEFAULT_BINDINGS,sanitizeBindings}=await load('store/preferences/keyBindings.ts');
  client=await load('net/socialClient.ts');const sent=[];client.setSocialConnection({readyState:WebSocket.OPEN,send:body=>sent.push(JSON.parse(body))});
  const guard={kind:'tank_barrier',remaining_s:0,cooldown_s:0,shield_hp:0,shield_max_hp:500,break_seq:0};let tick=0;
  const stage=(hero='tank',patch={})=>{const model=hero==='tank'?'tank':'brz';social.setState({view:{profile:{id:'profile',name:'Driver'},worlds:[],alpha:{active:{hero,world_id:1,team:'blue'}}}});network.setState({connected:true,playerId:'me',room_id:1,snapshot:{tick:++tick,received_at_ms:performance.now(),entities:[{id:'me',kind:'vehicle',vehicle_id:model,team:'blue',room_id:1,position:[0,1,0],rotation:[0,0,0,1],speed:0,gear:1,fuel:20,vehicle_mask:1,player_mask:0,wheels:[{grounded:true},{grounded:true}],health:{hp:500,max_hp:500,defeated:false},guard:hero==='tank'?guard:{...guard,kind:'brz_guard',shield_max_hp:200},combat:{enabled:true,cannon_reload:0,coax_reload:0,basket_reload:0},...patch}]}});ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});};
  const key=async(type,code,extra={})=>act(async()=>(document.activeElement?.tagName==='INPUT'?document.activeElement:window).dispatchEvent(new window.KeyboardEvent(type,{code,bubbles:true,cancelable:true,...extra})));
  const reply=async()=>act(async()=>client.receiveSocialResult({request_id:sent.at(-1).request_id,ok:true,data:{}}));
  await act(async()=>{stage();combat.getState().setEnabled(false);root=createRoot(document.getElementById('root'));root.render(h('div',null,h(Keyboard),h(GameController)));});await poll();
  await t.test('new collision-free barrier binding preserves all saved prior bindings',()=>{
   assert.equal(DEFAULT_BINDINGS.barrier,'KeyP');
   const oldBindings={...DEFAULT_BINDINGS,fire:'KeyP',forward:'KeyK'};delete oldBindings.barrier;
   const migrated=sanitizeBindings(oldBindings);assert.equal(migrated.fire,'KeyP');assert.equal(migrated.forward,'KeyK');assert.notEqual(migrated.barrier,'KeyP');assert.equal(new Set(Object.values(migrated)).size,Object.keys(DEFAULT_BINDINGS).length);
  });
  await t.test('P requests Tank barrier without enabling aim, repeating fire or authoring shield HP',async()=>{
   await key('keydown',prefs.getState().bindings.barrier);assert.equal(sent.at(-1).action,'tank_barrier');assert.equal(Object.hasOwn(sent.at(-1),'shield_hp'),false);assert.equal(combatIntent.enabled,false);assert.equal(combatIntent.keyboardFire,false);const count=sent.length;await key('keydown',prefs.getState().bindings.barrier,{repeat:true});assert.equal(sent.length,count);await reply();await key('keyup',prefs.getState().bindings.barrier);
   await act(async()=>stage('tank',{guard:{...guard,cooldown_s:10}}));await key('keydown',prefs.getState().bindings.barrier);assert.equal(sent.length,count);await key('keyup',prefs.getState().bindings.barrier);
   await act(async()=>stage());
  });
  await t.test('Tank Dpad Left is one barrier edge; menu-held input must release before it becomes an ability',async()=>{
   const count=sent.length;await press(14,true);assert.equal(sent.length,count+1);assert.equal(sent.at(-1).action,'tank_barrier');assert.equal(input.getState().input.vehicleMask&VehicleFlags.BLINKER_LEFT,0);await poll();assert.equal(sent.length,count+1);await reply();await press(14,false);
   await act(async()=>ui.setState({overlay:'pause'}));await poll();await press(14,true);await act(async()=>ui.setState({overlay:null}));await poll();await poll();assert.equal(sent.length,count+1,'held menu button cannot become a shield');await press(14,false);await press(14,true);assert.equal(sent.length,count+2);await reply();await press(14,false);
   assert(Object.values(tankFireInputs).every(source=>!source.primary&&!source.secondary));
  });
  await t.test('BRZ keeps left blinker and LB/Shift guard; Mechanic cannot borrow either shield',async()=>{
   await act(async()=>stage('brz'));await poll();const count=sent.length;await press(14,true);assert.equal(sent.length,count);assert.notEqual(input.getState().input.vehicleMask&VehicleFlags.BLINKER_LEFT,0);await press(14,false);
   await press(4,true);assert.equal(sent.length,count+1);assert.equal(sent.at(-1).action,'dps_guard_boost');assert.equal(input.getState().input.vehicleMask&VehicleFlags.BOOST,0);await reply();await press(4,false);
   await key('keydown','ShiftLeft');assert.equal(sent.length,count+2);assert.equal(sent.at(-1).action,'dps_guard_boost');assert.equal(input.getState().input.vehicleMask&VehicleFlags.BOOST,0);await reply();await key('keyup','ShiftLeft');
   await act(async()=>stage('mechanic'));await poll();await key('keydown',prefs.getState().bindings.barrier);await key('keyup',prefs.getState().bindings.barrier);assert.equal(sent.length,count+2,'shared BRZ model does not grant shield');
  });
  await t.test('loading, menus and typing never request Tank barrier',async()=>{
   await act(async()=>{stage();ui.setState({overlay:'pause'});});const count=sent.length;await key('keydown',prefs.getState().bindings.barrier);await key('keyup',prefs.getState().bindings.barrier);assert.equal(sent.length,count);
   await act(async()=>ui.setState({overlay:null,isModeLoading:true}));await poll();await press(14,true);await press(14,false);assert.equal(sent.length,count);
   await act(async()=>ui.setState({isModeLoading:false}));const field=document.createElement('input');document.body.append(field);field.focus();await key('keydown',prefs.getState().bindings.barrier);await press(14,true);assert.equal(sent.length,count);await press(14,false);field.blur();field.remove();
  });
 }finally{client?.setSocialConnection(null);if(root)await act(async()=>root.unmount());await vite?.close();dom.window.close();for(const[key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
