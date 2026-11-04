import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';

test('tab players preserve main credentials and Quickplay waits for a confirmed profile',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true}),original=new Map();
 for(const[k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,HTMLSelectElement:dom.window.HTMLSelectElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){
  original.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});
 }
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
 dom.window.HTMLMediaElement.prototype.play=async()=>{};dom.window.HTMLMediaElement.prototype.pause=()=>{};
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}}),load=p=>vite.ssrLoadModule('/src/'+p),root=createRoot(document.getElementById('root'));
 try{
  const client=await load('net/socialClient.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts'),{useNetworkStore:network}=await load('store/session/networkStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),{useAlphaStore:alpha}=await load('store/alpha/alphaStore.ts');
  // Compile the UI before beginning any fake server requests. The production
  // response deadline must not count cold SSR compilation during parallel tests.
  const {ModeSelection}=await load('game/alpha/ModeSelection.tsx'),{routeMenuAction:route}=await load('controls/inputRouting.ts'),{joinSelectedMode}=await load('game/alpha/sessionActions.ts');
  const key='avenlab-social-profile-v1:server-one',main={id:'main',token:'a'.repeat(64),name:'Main'},tab={id:'tab',token:'b'.repeat(64),name:'DRIVER 2'};
  const sent=[],socket={readyState:WebSocket.OPEN,send:body=>sent.push(JSON.parse(body))};
  const flush=()=>act(async()=>Promise.resolve());
  const reply=(request,data,ok=true,message)=>client.receiveSocialResult({request_id:request.request_id,ok,data,message});
  const view=(id,name='DRIVER 2')=>({profile:{id,name},players:[],teammates:[],requests:[],groups:[],worlds:[],world_invites:[],current_world_id:null,limits:{active_worlds:0,max_active_worlds:2,active_players:0,max_players:10},maps:['road_precision']});
  await t.test('duplicate saved player is actionable before any mode_join and controller A can create a tab player',async()=>{
   localStorage.setItem(key,JSON.stringify(main));client.setSocialConnection(socket);client.beginSocialSession('server-one');assert.equal(sent.at(-1).token,main.token);
   network.setState({connected:true});alpha.getState().chooseMode('quickplay');ui.setState({screen:'mode_select',overlay:null,isModeLoading:false});
   await act(async()=>root.render(h(ModeSelection)));assert(document.querySelector('.alpha-deploy').disabled);
   await assert.rejects(joinSelectedMode(),/Restore your player profile/);assert.equal(sent.filter(r=>r.action==='mode_join').length,0);
   await act(async()=>route('activate'));assert.equal(sent.filter(r=>r.action==='mode_join').length,0);
   const during=client.createTabProfile();await assert.rejects(during,/restoration to finish/);assert.equal(sent.length,1,'do not race the initial identity request');
   await act(async()=>reply(sent[0],{},false,'This player profile is already connected in another tab.'));await flush();
   assert.match(document.querySelector('[aria-label="Player profile recovery"]').textContent,/already connected in another tab/);assert.match(document.querySelector('[role="note"]').textContent,/First to 3 captures/);
   await act(async()=>route('right'));assert.match(document.activeElement.textContent,/NEW TAB PROFILE$/);
   await act(async()=>route('activate'));const create=sent.at(-1);assert.equal(create.action,'identify');assert.equal(create.token,undefined);
   await act(async()=>{reply(create,{profile_id:tab.id,token:tab.token});client.receiveSocialState(view(tab.id));});await flush();
   assert.equal(JSON.parse(localStorage.getItem(key)).token,main.token);assert.equal(JSON.parse(dom.window.sessionStorage.getItem(key+':tab')).token,tab.token);
   assert.equal(document.querySelector('.alpha-deploy').disabled,false);
   await act(async()=>route('activate'));const join=sent.at(-1);assert.equal(join.action,'mode_join');assert.equal(join.mode,'quickplay');
   await act(async()=>reply(join,{status:'joined',hero:''}));await flush();assert.equal(ui.getState().screen,'hero_select');
   await act(async()=>root.render(null));
  });
  await t.test('reload restores only this tab identity; an inherited duplicate can recover without changing the main player',async()=>{
   client.setSocialConnection(socket);client.beginSocialSession('server-one');assert.equal(sent.at(-1).token,tab.token);
   reply(sent.at(-1),{profile_id:tab.id,token:null});await flush();client.receiveSocialState(view(tab.id));
   client.setSocialConnection(socket);client.beginSocialSession('server-one');reply(sent.at(-1),{},false,'This player profile is already connected in another tab.');await flush();
   const before=dom.window.sessionStorage.getItem(key+':tab'),failed=client.createTabProfile();reply(sent.at(-1),{},false,'The server has reached its profile limit.');await assert.rejects(failed,/profile limit/);
   assert.equal(dom.window.sessionStorage.getItem(key+':tab'),before);assert.equal(JSON.parse(localStorage.getItem(key)).token,main.token);
   const next=client.createTabProfile();reply(sent.at(-1),{profile_id:'tab-two',token:'c'.repeat(64)});await next;
   assert.equal(JSON.parse(dom.window.sessionStorage.getItem(key+':tab')).id,'tab-two');assert.equal(JSON.parse(localStorage.getItem(key)).id,main.id);
  });
  await t.test('a newly opened tab keeps using the main player; server keys isolate tab credentials',async()=>{
   dom.window.sessionStorage.clear();client.setSocialConnection(socket);client.beginSocialSession('server-one');assert.equal(sent.at(-1).token,main.token);
   reply(sent.at(-1),{profile_id:main.id,token:null});await flush();
   client.setSocialConnection(socket);client.beginSocialSession('other-server');assert.equal(sent.at(-1).token,undefined);
   reply(sent.at(-1),{profile_id:'other',token:'d'.repeat(64)});await flush();assert.equal(JSON.parse(localStorage.getItem(key)).id,main.id);
  });
  await t.test('late old-connection acknowledgements cannot replace current profile credentials or errors',async()=>{
   client.setSocialConnection(socket);client.beginSocialSession('server-one');reply(sent.at(-1),{profile_id:main.id,token:null});await flush();
   const pending=client.createTabProfile();reply(sent.at(-1),{profile_id:'old',token:'e'.repeat(64)});client.setSocialConnection(null);
   await assert.rejects(pending,/connection changed/);assert.equal(dom.window.sessionStorage.getItem(key+':tab'),null);assert.equal(JSON.parse(localStorage.getItem(key)).token,main.token);assert.equal(social.getState().profileStatus,'idle');assert.equal(social.getState().message,'Connecting to the game server…');
  });
 }finally{await act(async()=>root.unmount());await vite.close();dom.window.close();for(const[k,v]of original){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
});
