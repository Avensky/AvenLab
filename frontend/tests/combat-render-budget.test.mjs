import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h,Profiler} from 'react';
import {createRoot} from 'react-dom/client';

test('weapon display work follows visible controls and display precision',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true});
 const old=new Map();let vite,root;
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){
  old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 try{
  vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  const load=p=>vite.ssrLoadModule('/src/'+p);
  const {useNetworkStore:net}=await load('store/session/networkStore.ts');
  const {useUIStore:ui}=await load('store/menus/uiStore.ts');
  const {usePreferencesStore:prefs}=await load('store/preferences/preferencesStore.ts');
  const {useCombatStore:combat}=await load('combat/combatStore.ts');
  const {WeaponSelector}=await load('combat/WeaponSelector.tsx');
  const {CooldownClock}=await load('combat/CooldownClock.tsx');
  const {weaponReload,displayReload,reloadState}=await load('combat/weaponCooldown.ts');
  await t.test('reload lookup preserves independent slots, legacy packets and unknown state',()=>{
   const confirmed={weapon:'coax',reload:.1,cannon_reload:0,coax_reload:.08,basket_reload:.06};
   assert.deepEqual(['primary','cannon','coax','basket'].map(w=>weaponReload(confirmed,w)),[.1,0,.08,.06]);
   assert.equal(weaponReload({weapon:'cannon',reload:2},'cannon'),2);
   assert.equal(weaponReload({weapon:'coax',reload:.1},'cannon'),undefined);
   for(const value of [undefined,NaN,Infinity])assert.equal(reloadState(weaponReload({cannon_reload:value},'cannon')),'waiting');
   assert.equal(displayReload(.0001),.05);assert.equal(reloadState(displayReload(.0001)),'cooling');
   assert.equal(reloadState(displayReload(0)),'ready');
  });
  ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});
  combat.getState().setEnabled(true);prefs.getState().update({hudGroups:{turret:true}});
  let tick=0,commits=0;
  const send=reload=>net.getState().setSnapshot({tick:++tick,entities:[{id:'me',vehicle_id:'tank',room_id:1,position:[tick,1,0],rotation:[0,0,0,1],combat:{enabled:true,weapon:'cannon',cannon_reload:reload,coax_reload:0,yaw:tick/10}}]},performance.now());
  net.setState({connected:true,playerId:'me'});send(3);
  root=createRoot(document.getElementById('root'));
  const mount=async Component=>{await act(()=>root.render(h(Profiler,{id:'weapon',onRender:()=>commits++},h(Component,{weapon:'cannon'}))));commits=0;};
  await t.test('hidden legacy weapon panel does not commit on incoming combat poses',async()=>{
   await mount(WeaponSelector);
   for(let i=1;i<=60;i++)await act(()=>send(3-i/60));
   console.log('hidden weapon panel commits / 60 snapshots:',commits);
   assert.equal(document.querySelector('.weapon-selector'),null);assert.equal(commits,0);
  });
  await t.test('cooldown ring updates at display precision and never reaches ready early',async()=>{
   await act(()=>send(3));await mount(CooldownClock);
   for(let i=1;i<=60;i++)await act(()=>send(3-i/60));
   console.log('cooldown ring commits / 60 snapshots:',commits);
   assert(commits>=19&&commits<=21,'one second of cannon reload needs about 20 display changes');
   await act(()=>send(.0001));assert(document.querySelector('[aria-label="Weapon cooling down"]'));
   await act(()=>send(0));assert(document.querySelector('[aria-label="Weapon ready"]'));
   await act(()=>send(undefined));assert(document.querySelector('[aria-label="Cooldown unavailable"]'));
  });
 }finally{
  if(root)await act(()=>root.unmount());await vite?.close();dom.window.close();
  for(const[key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
 }
});
