import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';

const flag=(team,status='home',carrier=null)=>({team,base:[team==='red'?0:30,1,0],position:[team==='red'?0:30,1,0],status,carrier,return_remaining_s:0});
const match=(extra={})=>({match_id:'round',mode:'quickplay',training:false,phase:'running',elapsed_s:10,remaining_s:890,duration_s:900,captures_to_win:3,scores:{red:0,blue:0},flags:[flag('red'),flag('blue')],winner:null,events:[],...extra});
const event=(seq,kind='picked_up',flag_team='blue',player_id='me')=>({seq,kind,flag_team,player_id,elapsed_s:10});
const me=(position=[0,1,0])=>({id:'me',vehicle_id:'brz',kind:'vehicle',team:'red',room_id:1,position,rotation:[0,0,0,1],speed:0});

test('CTF Missions use authoritative event IDs and confirmed home-base delivery',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map();let vite,root;
 for(const[k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});}
 try{
  vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}});const load=p=>vite.ssrLoadModule('/src/'+p);
  const {createCtfEventObserver,flagEventNotice}=await load('game/stats/ctfMissionEvents.ts'),{getCtfCaptureObjective:objective}=await load('game/stats/ctfObjective.ts');
  const {useNetworkStore:network}=await load('store/session/networkStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),{useMissionRadioStore:missions}=await load('store/missions/missionRadioStore.ts'),{useCtfFeedbackStore:feedback}=await load('game/stats/ctfFeedbackStore.ts');
  const {CtfMissionLifecycle}=await load('game/stats/CtfMissionLifecycle.tsx'),{CtfMatchHUD}=await load('game/stats/CtfMatchHUD.tsx'),{MissionApps}=await load('ui/Cockpit/MissionApps.tsx');root=createRoot(document.getElementById('root'));
  await t.test('late join baselines history, fast intermediate events survive, duplicate/out-of-order frames do not replay',()=>{
   const observe=createCtfEventObserver();assert.deepEqual(observe('world',match({events:[event(1)]}),1),[]);
   const observed=observe('world',match({events:[event(1),event(2,'dropped'),event(3,'returned')]}),2);assert.deepEqual(observed.map(e=>e.kind),['dropped','returned']);assert.equal(new Set(observed.map(e=>e.id)).size,2);
   assert.deepEqual(observe('world',match({events:[event(3)]}),2),[]);assert.deepEqual(observe('world',match({events:[event(4)]}),1),[]);assert.deepEqual(observe('world',match({events:[event(3)]}),3),[]);
   assert.deepEqual(observe('different-world',match({events:[event(4)]}),4),[]);assert.equal(observe('different-world',match({events:[event(5)]}),5)[0].seq,5);
  });
  await t.test('warmup reset emits no invented return, sequence survives, fallback distinguishes capture from flag return',()=>{
   const observe=createCtfEventObserver();observe('warm',match({phase:'waiting',events:[event(8)],flags:[flag('red'),flag('blue','carried','me')]}),1);
   assert.deepEqual(observe('warm',match({events:[]}),2),[]);assert.equal(observe('warm',match({events:[event(9)]}),3)[0].seq,9);
   const fallback=createCtfEventObserver();fallback('old',match({events:undefined,flags:[flag('red'),flag('blue','carried','me')]}),1);
   assert.deepEqual(fallback('old',match({events:undefined,phase:'ended',scores:{red:3,blue:0}}),2).map(e=>e.kind),['captured']);
   const notice=flagEventNotice({...event(1),id:'ctf:one',warmup:true},'me');assert.match(notice.message,/WARMUP.*No scoring/);assert.match(notice.message,/You picked up/);
  });
  await t.test('capture objective uses own home cylinder and blocks both carried and dropped own flags',()=>{
   const carried=match({flags:[flag('red'),flag('blue','carried','me')]});assert.equal(objective(carried,me([30,1,0])).state,'return_home');assert.equal(objective(carried,me()).state,'awaiting');assert.equal(objective(carried,me([3,5,0])).atBase,true);assert.equal(objective(carried,me([3.01,1,0])).atBase,false);assert.equal(objective(carried,me([0,5.01,0])).atBase,false);
   for(const status of ['carried','dropped'])assert.equal(objective({...carried,flags:[flag('red',status,status==='carried'?'enemy':null),carried.flags[1]]},me()).state,'blocked');
   assert.equal(objective({...carried,phase:'waiting'},me()).state,'warmup');assert.equal(objective({...carried,phase:'ended'},me()),null);assert.equal(objective(carried,{...me(),health:{defeated:true}}),null);
  });
  const snapshot=(tick,data=match(),entity=me())=>({tick,entities:[entity],match_state:data});
  const stage=async(snap)=>act(async()=>{ui.setState({screen:'sandbox',isModeLoading:false,overlay:null});network.setState({connected:true,playerId:'me',room_id:1,snapshot:snap});});
  await t.test('Missions collects hidden-panel events, captures display only after server event and labels carried state once',async()=>{
   missions.getState().clear();feedback.setState({capture:null});await stage(snapshot(1));await act(async()=>root.render(h('div',null,h(CtfMissionLifecycle),h(CtfMatchHUD),h(MissionApps))));
   const carried=match({flags:[flag('red','dropped'),flag('blue','carried','me')],events:[event(1)]});await stage(snapshot(2,carried));assert.match(document.querySelector('.ctf-capture-cue').textContent,/CAPTURE BLOCKED/);assert.equal(feedback.getState().capture,null);assert.equal(document.querySelector('.ctf-flag-status'),null);assert.equal(document.querySelectorAll('.mission-radio-history article').length,1);assert.match(document.querySelector('.mission-radio-history').textContent,/BLUE FLAG PICKED UP/);
   await stage(snapshot(3,match({flags:[flag('red'),flag('blue','carried','me')],events:[event(1),event(2,'returned','red','ally')]})));assert.match(document.querySelector('.ctf-capture-cue').textContent,/AWAITING CAPTURE CONFIRMATION/);assert.equal(feedback.getState().capture,null);
   await stage(snapshot(4,match({scores:{red:1,blue:0},events:[event(1),event(2,'returned','red','ally'),event(3,'captured')]})));assert.match(document.querySelector('.ctf-capture-cue').textContent,/CAPTURE CONFIRMED.*\+1/);assert.equal(missions.getState().history.length,3);assert.match(document.querySelector('[role="log"]').textContent,/RED CAPTURE CONFIRMED/);
   await stage(snapshot(5,match({scores:{red:1,blue:0},events:[event(3,'captured')]})));assert.equal(missions.getState().history.length,3,'retained event is not published twice');
  });
  await t.test('transport reconnect preserves event cursor; new rounds clear only CTF feed and baseline old events',async()=>{
   await act(async()=>missions.getState().publish({id:'nonctf',title:'Mission message',message:'Keep this',kind:'update'}));await act(async()=>network.setState({connected:false}));await act(async()=>network.setState({connected:true}));assert.equal(missions.getState().history.length,4);
   await stage(snapshot(6,match({match_id:'new-round',events:[event(1)]})));assert.equal(missions.getState().history.length,1);assert.equal(missions.getState().history[0].id,'nonctf');assert.equal(feedback.getState().capture,null);
   await stage(snapshot(7,match({match_id:'new-round',events:[event(1),event(2,'dropped')]})));assert.equal(missions.getState().history.length,2);await act(async()=>ui.setState({screen:'main'}));assert.equal(missions.getState().history.length,1);
  });
 }finally{if(root)await act(async()=>root.unmount());await vite?.close();dom.window.close();for(const[k,v]of old)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}
});
