import test from 'node:test';import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';import {createServer} from 'vite';

test('scope screen dragging aims the turret with zoom precision and separate pointer ownership',async t=>{
 const dom=new JSDOM('<canvas></canvas><button>Scope zoom</button><aside>Research panel</aside>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map();
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 const canvas=document.querySelector('canvas'),button=document.querySelector('button'),research=document.querySelector('aside'),captured=new Set();
 canvas.setPointerCapture=id=>captured.add(id);canvas.hasPointerCapture=id=>captured.has(id);canvas.releasePointerCapture=id=>captured.delete(id);
 let visible='visible';Object.defineProperty(document,'visibilityState',{get:()=>visible,configurable:true});document.hasFocus=()=>true;
 const pointer=(target,type,{id=1,x=0,y=0,pointerType='mouse',buttons=1}={})=>{const event=new window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,buttons,clientX:x,clientY:y});Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:pointerType}});target.dispatchEvent(event);};
 let vite,stop;
 try{
  vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}});const load=p=>vite.ssrLoadModule('/src/'+p);
  const {useCombatStore:combat,combatIntent,tankFireInputs}=await load('combat/combatStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),{useNetworkStore:network}=await load('store/session/networkStore.ts'),{usePreferencesStore:prefs}=await load('store/preferences/preferencesStore.ts');
  const {bindScopedAimDrag,scopeDragDelta}=await load('combat/scopeAim.ts');
  const entity={id:'me',vehicle_id:'tank',position:[0,1,0],rotation:[0,0,0,1],health:{hp:500,defeated:false},combat:{enabled:true,yaw:0,pitch:0}};
  const ready=()=>{ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});network.setState({connected:true,playerId:'me',snapshot:{entities:[entity]}});combat.getState().setEnabled(true);combat.getState().setScope(false);combat.getState().setOrientationLocked(true);combat.getState().setScopeZoom(2);combat.getState().setScope(true);combatIntent.yaw=0;combatIntent.pitch=0;prefs.getState().update({turretYawSensitivity:1,turretPitchSensitivity:1});};
  ready();stop=bindScopedAimDrag(canvas);
  await t.test('right/down drag turns right/down and reuses independent turret sensitivity settings',()=>{
   prefs.getState().update({turretYawSensitivity:2,turretPitchSensitivity:.5});pointer(canvas,'pointerdown');pointer(canvas,'pointermove',{x:100,y:25});
   assert(Math.abs(combatIntent.yaw+.4)<1e-9);assert(-Math.sin(combatIntent.yaw)>0,'right drag turns direction right from forward');assert(Math.abs(combatIntent.pitch+.025)<1e-9,'down drag lowers the barrel');pointer(canvas,'pointerup',{buttons:0});
   assert.equal(combatIntent.fire,false);assert.equal(combatIntent.keyboardFire,false);assert.equal(combatIntent.gamepadFire,false);assert.equal(combatIntent.firePulseUntil,0);for(const source of Object.values(tankFireInputs))assert.deepEqual(source,{primary:false,secondary:false,primaryPulseUntil:0,secondaryPulseUntil:0});
  });
  await t.test('4x zoom halves angular travel and a magnification change does not jump drag coordinates',()=>{
   ready();assert.deepEqual(scopeDragDelta(100,40,2),[.2,.08]);assert.deepEqual(scopeDragDelta(100,40,4),[.1,.04]);assert.equal(scopeDragDelta(NaN,1,2),null);assert.equal(scopeDragDelta(1,1,0),null);
   pointer(canvas,'pointerdown');pointer(canvas,'pointermove',{x:100,y:40});assert(Math.abs(combatIntent.yaw+.2)<1e-9);combat.getState().setScopeZoom(4);pointer(canvas,'pointermove',{x:200,y:80});assert(Math.abs(combatIntent.yaw+.3)<1e-9);assert(Math.abs(combatIntent.pitch+.12)<1e-9);pointer(canvas,'pointerup',{buttons:0});
  });
  await t.test('zoom/research/HUD gestures cannot aim and an additional touch cannot steal a drag',()=>{
   ready();const original=[combatIntent.yaw,combatIntent.pitch];for(const target of [button,research]){pointer(target,'pointerdown');pointer(target,'pointermove',{x:100,y:100});pointer(target,'pointerup',{buttons:0});}assert.deepEqual([combatIntent.yaw,combatIntent.pitch],original);
   pointer(canvas,'pointerdown',{id:4,pointerType:'touch'});pointer(button,'pointerdown',{id:5,pointerType:'touch'});pointer(canvas,'pointermove',{id:5,pointerType:'touch',x:200});assert.deepEqual([combatIntent.yaw,combatIntent.pitch],original);pointer(canvas,'pointermove',{id:4,pointerType:'touch',x:10});assert(Math.abs(combatIntent.yaw+.02)<1e-9);pointer(canvas,'pointercancel',{id:4,pointerType:'touch'});assert(!captured.has(4));
  });
  await t.test('outside scope, menus, defeat, ended matches, disconnect and missing vehicles cannot aim',()=>{
   const block=[()=>combat.getState().setScope(false),()=>ui.setState({overlay:'pause'}),()=>ui.setState({isModeLoading:true}),()=>network.setState({snapshot:{entities:[{...entity,health:{...entity.health,defeated:true}}]}}),()=>network.setState({snapshot:{match_state:{phase:'ended'},entities:[entity]}}),()=>network.setState({connected:false}),()=>network.setState({snapshot:{entities:[{...entity,vehicle_id:undefined}]}})];
   for(const change of block){ready();pointer(canvas,'pointerdown');change();const before=[combatIntent.yaw,combatIntent.pitch];pointer(canvas,'pointermove',{x:500,y:500});assert.deepEqual([combatIntent.yaw,combatIntent.pitch],before);assert(!captured.has(1));}
  });
  await t.test('exit scope restores the prior lock and blur/hidden/unmount release captures without firing',()=>{
   ready();pointer(canvas,'pointerdown');pointer(canvas,'pointermove',{x:10,y:5});combat.getState().setScope(false);assert.equal(combat.getState().orientationLocked,true);pointer(canvas,'pointermove',{x:100,y:100});assert(!captured.has(1));
   ready();pointer(canvas,'pointerdown');window.dispatchEvent(new Event('blur'));assert(!captured.has(1));pointer(canvas,'pointerdown');visible='hidden';document.dispatchEvent(new Event('visibilitychange'));assert(!captured.has(1));visible='visible';
   pointer(canvas,'pointerdown');stop();stop=null;assert(!captured.has(1));const before=[combatIntent.yaw,combatIntent.pitch];pointer(canvas,'pointerdown');pointer(canvas,'pointermove',{x:100,y:100});assert.deepEqual([combatIntent.yaw,combatIntent.pitch],before);assert.equal(combatIntent.fire,false);
  });
 }finally{stop?.();await vite?.close();dom.window.close();for(const[key,value]of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});
