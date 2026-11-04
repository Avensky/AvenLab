import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h,Profiler} from 'react';
import {createRoot} from 'react-dom/client';

test('nearby allies do not churn the HUD layout, bake live portraits or toggle instrument power',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true}),original=new Map();
 for(const[k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){
  original.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});
 }
 Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
 // UI display clocks are advanced explicitly; no real timers race the delayed
 // snapshot assertions. Vite's own Node timers remain untouched.
 const timers=new Map();let serial=0;
 window.setInterval=fn=>{const id=++serial;timers.set(id,fn);return id;};window.clearInterval=id=>timers.delete(id);
 const vite=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',cacheDir:'node_modules/.vite-hud-performance-test'}),load=p=>vite.ssrLoadModule('/src/'+p),root=createRoot(document.getElementById('root'));
 try{
  const {useNetworkStore:network}=await load('store/session/networkStore.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts');
  const {useVehicleTelemetryStore:telemetry,updateVehicleTelemetry:update,projectVehicleTelemetry:project}=await load('store/telemetry/vehicleTelemetryStore.ts');
  const {DEFAULT_GAUGE_CONFIG,useVehicleConfigStore:configs}=await load('store/session/vehicleConfigStore.ts');
  const {readTeammates,retainTeammateCards}=await load('ui/FuturisticHUD/teammateModel.ts'),{TeammateHUD}=await load('ui/FuturisticHUD/TeammateHUD.tsx');
  const {default:Dashboard}=await load('ui/Dashboard/Dashboard.tsx'),{displayPower}=await load('ui/Dashboard/dashboardModel.ts');
  const {createInstrumentContinuity}=await load('store/telemetry/instrumentContinuity.ts');
  const health={hp:400,max_hp:500,defeated:false,respawn_remaining_s:0,spawn_protection_s:1.9,damage_seq:0,last_attacker:null,last_damage:0,last_damage_kind:'',kills:0,deaths:0,stats:{damage_dealt:0,healing_done:0,self_healing:0,gas_burned_liters:0,gas_gained_liters:0,assists:0,resurrections:0,respawns:0}};
  const me={id:'me',kind:'vehicle',vehicle_id:'brz',room_id:2,team:'blue',position:[0,1,0],rotation:[0,0,0,1],speed:12,rpm:3000,gear:2,fuel:20,temp:85,vehicle_mask:1,player_mask:0,resource_mask:0,health};
  const appearance={body:'#fd4488',finish:'gloss',seats:'factory',skin:'factory'};
  const allies=[0,1,2].map(i=>({...me,id:'ally-'+i,appearance,health:{...health,stats:{...health.stats}}}));let tick=0,receipt=performance.now();
  const send=()=>network.getState().setSnapshot({tick:++tick,entities:[me,...allies]},receipt);
  network.setState({connected:true,playerId:'me',room_id:2});ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});configs.setState({byPlayer:{me:{...DEFAULT_GAUGE_CONFIG}}});send();
  await t.test('shared portraits opened through live overlays defer cold bakes without a caller prop',async()=>{
   const {HeroPortrait}=await load('game/alpha/HeroPortrait.tsx');
   const previousTimeout=window.setTimeout;let bakeRequests=0;
   window.setTimeout=(fn,delay,...args)=>{
    if(delay===120){bakeRequests++;return 987654;}
    return previousTimeout(fn,delay,...args);
   };
   try{
    await act(async()=>root.render(h(HeroPortrait,{hero:'brz',appearance})));
    assert.equal(document.querySelector('.hero-portrait-art').dataset.cacheOnly,'true');
    assert.equal(document.querySelector('.hero-portrait-art').dataset.style,'deferred');
    assert.equal(bakeRequests,0,'default live portrait never schedules GLB/GPU work');
    await act(async()=>ui.setState({overlay:'pause'}));assert.equal(bakeRequests,0,'an overlay keeps the underlying driving context');
    await act(async()=>ui.setState({screen:'heroes',overlay:null}));
    assert.equal(document.querySelector('.hero-portrait-art').dataset.cacheOnly,'false');assert.equal(bakeRequests,1,'Heroes retains its normal deferred custom-image request');
    await act(async()=>ui.setState({screen:'sandbox'}));assert.equal(bakeRequests,1,'returning to the world cancels rather than rescheduling the bake');
    assert.equal(document.querySelectorAll('canvas').length,0);
   }finally{await act(async()=>root.render(null));window.setTimeout=previousTimeout;}
  });
  await t.test('100 position/stat packets retain squad row identities and mounted cards',async()=>{
   let cards=readTeammates(receipt);assert.equal(cards.length,3);let commits=0;await act(async()=>root.render(h(Profiler,{id:'squad',onRender:()=>commits++},h(TeammateHUD))));const portraits=[...document.querySelectorAll('.teammate-hud img')];assert.equal(portraits.length,3);const initialCommits=commits;
   for(let i=0;i<100;i++){
    allies.forEach((ally,index)=>{ally.position=[i+index,1,index-i];ally.health={...ally.health,spawn_protection_s:1.5-i*.005,stats:{...ally.health.stats,damage_dealt:i*6,gas_burned_liters:i*.001}};});
    send();const next=retainTeammateCards(cards,readTeammates(receipt));assert.equal(next,cards,'unshown stats/pose and timer decimals are not squad-card changes');cards=next;
   }
   await act(async()=>{for(const fn of [...timers.values()])fn();});assert.equal(commits,initialCommits);assert.deepEqual([...document.querySelectorAll('.teammate-hud img')],portraits);
   assert.equal(document.querySelectorAll('[data-cache-only="true"][data-style="deferred"]').length,3);
   assert.equal(document.querySelectorAll('canvas').length,0,'three uncached styled allies do not create portrait canvases');
   const delayed=readTeammates(receipt+900);assert.equal(delayed.length,3);assert(delayed.every(card=>card.status==='delayed'&&card.health===null),'delays keep identities visible while health becomes unknown');
  });

  await t.test('3v3 limits the squad to two teammates and other teams/worlds remain excluded',()=>{
   social.setState({view:{profile:{id:'profile-me',name:'me'},worlds:[],alpha:{active:{mode:'skirmish',world_id:2,team:'blue',hero:'brz',team_size:3},roster:[]}}});
   const hostile={...me,id:'enemy',team:'red'},foreign={...me,id:'other-world',room_id:8};network.getState().setSnapshot({tick:++tick,entities:[me,...allies,hostile,foreign]},receipt);
   assert.equal(readTeammates(receipt).length,2);assert(readTeammates(receipt).every(card=>card.id.startsWith('ally-')));
   social.setState({view:null});send();
  });

  await t.test('delayed readings do not fake engine OFF or replay START, and disconnect/expiry clears power',async()=>{
   receipt=performance.now();send();update(receipt+10);
   await act(async()=>root.render(h(Dashboard)));const dashboard=document.querySelector('.driving-dashboard');assert.equal(dashboard.dataset.power,'running');
   await act(async()=>update(receipt+650));assert.equal(document.querySelector('.driving-dashboard'),dashboard);assert.equal(dashboard.dataset.signal,'stale');assert.equal(dashboard.dataset.power,'running');assert.equal(dashboard.dataset.powerHeld,'true');assert.equal(telemetry.getState().data.speedKph,null);assert.equal(telemetry.getState().data.rpm,null);
   await act(async()=>ui.setState({overlay:'pause'}));assert.equal(dashboard.dataset.power,'running','pause is not an engine state');await act(async()=>ui.setState({overlay:null}));
   await act(async()=>update(receipt+2100));assert.equal(dashboard.dataset.power,'unavailable');
   receipt=performance.now();send();await act(async()=>update(receipt));assert.equal(dashboard.dataset.power,'running');
   await act(async()=>{network.setState({connected:false});update(receipt+50);});assert.equal(dashboard.dataset.power,'unavailable');
   network.setState({connected:true});send();
   const continuity=createInstrumentContinuity(),running=project(me,true,1000,1100),delayed=project(me,true,1000,1650);
   continuity('me:2:brz',running,1000,1100);assert.equal(continuity('me:2:tank',delayed,1000,1650),undefined,'a new vehicle cannot inherit old illumination');
   const crank={...running,engineOn:false,resourceMask:1};
   // STARTING is defined by the shared resource mask, not guessed from RPM.
   const {ResourceFlags}=await load('store/telemetry/resourceMasks.ts');crank.resourceMask=ResourceFlags.STARTING;
   continuity('crank',crank,1000,1100);const held=continuity('crank',delayed,1000,1650);assert.equal(held,'on');assert.equal(displayPower({...delayed,instrumentPower:held}),'on');
  });

  await t.test('telemetry DOM replacements do not reconnect resize observers or cause layout passes',async()=>{
   await act(async()=>root.render(null));const oldResize=Object.getOwnPropertyDescriptor(globalThis,'ResizeObserver');
   let scans=0,observed=0,unobserved=0,measurements=0,frames=0;const queue=new Map();let frameId=0;
   class Resize {constructor(callback){this.callback=callback;}observe(){observed++;this.callback([]);}unobserve(){unobserved++;}disconnect(){}}
   Object.defineProperty(globalThis,'ResizeObserver',{value:Resize,configurable:true,writable:true});const oldFrame=window.requestAnimationFrame,oldCancel=window.cancelAnimationFrame;
   window.requestAnimationFrame=fn=>{frames++;const id=++frameId;queue.set(id,fn);return id;};window.cancelAnimationFrame=id=>queue.delete(id);
   const host=document.createElement('div'),card=document.createElement('div'),value=document.createElement('span');card.className='card';card.append(value);host.append(card);document.body.append(host);
   const {observeHudLayout}=await load('ui/hud/observeHudLayout.ts');const stop=observeHudLayout(host,()=>{scans++;return [...host.querySelectorAll('.card'),...document.querySelectorAll('.support-test-fallback')];},()=>measurements++,document.body);
   let fallback;
   try{
    const flush=()=>{const work=[...queue.values()];queue.clear();for(const fn of work)fn();};flush();const initialScans=scans,initialObserved=observed,initialFrames=frames,initialMeasures=measurements;
    for(let i=0;i<100;i++){value.replaceChildren(document.createTextNode('HP '+i));await Promise.resolve();flush();}
    assert.equal(scans,initialScans,'text-only changes never search the HUD tree');assert.equal(observed,initialObserved,'no repeated observe() initial notifications');assert.equal(unobserved,0);assert.equal(frames,initialFrames);assert.equal(measurements,initialMeasures,'no forced layout per changing status/value');
    const newCard=document.createElement('div');newCard.className='card';host.append(newCard);await Promise.resolve();flush();assert.equal(observed,initialObserved+1);assert.equal(measurements,initialMeasures+1,'actual layout root mount measures once');
    fallback=document.createElement('aside');fallback.className='support-test-fallback';document.body.append(fallback);await Promise.resolve();flush();assert.equal(observed,initialObserved+2);assert.equal(measurements,initialMeasures+2,'a sibling support control also reserves screen space');
    fallback.remove();await Promise.resolve();flush();assert.equal(unobserved,1,'removing a sibling does not reconnect existing observers');assert.equal(measurements,initialMeasures+3);
   }finally{stop();fallback?.remove();host.remove();window.requestAnimationFrame=oldFrame;window.cancelAnimationFrame=oldCancel;if(oldResize)Object.defineProperty(globalThis,'ResizeObserver',oldResize);else delete globalThis.ResizeObserver;}
  });
 }finally{await act(async()=>root.unmount());await vite.close();dom.window.close();for(const[k,v]of original){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
});
