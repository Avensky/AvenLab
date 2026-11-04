import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';

const stats={kills:4,deaths:2,assists:3,resurrections:0,respawns:2,captures:1,flag_returns:1,damage_dealt:2410,healing_done:300,self_healing:50,gas_burned_liters:2.5,gas_gained_liters:1.2,play_time_s:420,best_kill_streak:3};
const appearance={body:'factory',finish:'frs',seats:'factory',skin:'factory'};
const participant=(id,team,awards=[])=>({profile_id:id,name:id==='self'?'LOCAL DRIVER':'OTHER DRIVER',team,hero:'tank',appearance:{...appearance},stats:{...stats},abandoned:false,awards});
const match=(id,extra={})=>({match_id:id,world_id:4,mode:'quickplay',map:'coastal_district',ended_at:1793701000,duration_s:450,training:false,winner:'red',score:[3,1],participants:[participant('self','red',['mvp']),participant('other','blue',['svp'])],play_of_game:{profile_id:'self',start_s:30,end_s:40,score:100,kills:2,captures:1,damage:700,replay_available:false},...extra});

test('saved/live results use server outcomes and preserve modal/action ownership',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true}),original=new Map();
 for(const[k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,KeyboardEvent:dom.window.KeyboardEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){
  original.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});
 }
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};dom.window.HTMLElement.prototype.scrollTo=()=>{};dom.window.HTMLElement.prototype.scrollBy=()=>{};
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}}),load=p=>vite.ssrLoadModule('/src/'+p),root=createRoot(document.getElementById('root'));
 let client;
 try{
  const data=await load('game/results/resultData.ts'),store=await load('store/session/matchResultsStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts');
  const {MatchResultsScreen}=await load('game/results/MatchResultsScreen.tsx'),{leaveMatchResults,playAgainFromResults}=await load('game/results/resultActions.ts');client=await load('net/socialClient.ts');
  // Precompile everything before creating fake requests; their deadlines are
  // production deadlines and must not count cold SSR compilation.
  const sent=[];client.setSocialConnection({readyState:WebSocket.OPEN,send:body=>sent.push(JSON.parse(body))});
  social.setState({view:{profile:{id:'self',name:'LOCAL DRIVER'},worlds:[],alpha:null}});
  const flush=()=>act(async()=>Promise.resolve()),reply=(request,data={},ok=true,message)=>client.receiveSocialResult({request_id:request.request_id,data,ok,message});
  const render=()=>act(async()=>root.render(h(MatchResultsScreen)));
  await t.test('parser bounds numbers, participant identity, archive wrapper and immutable snapshots',()=>{
   const source=match('validation'),record=data.parseMatchResult(source);source.participants[0].stats.kills=999;assert.equal(record.participants[0].stats.kills,4);
   assert(data.parseMatchResult({match:match('wrapped')}));assert(data.parseMatchResult({type:'match_result',data:match('packet')}));
   assert.equal(data.parseMatchResult(match('nan',{duration_s:NaN})),null);
   assert.equal(data.parseMatchResult(match('format',{mode:'competitive',team_size:3})).team_size,3);assert.equal(data.parseMatchResult(match('badformat',{mode:'competitive',team_size:1})),null);assert.equal(data.parseMatchResult(match('practice',{mode:'sandbox',team_size:1})).team_size,1);assert.equal(data.parseMatchResult(match('old',{team_size:null})).team_size,null);
   const invalid=match('invalid');invalid.participants[0].stats.gas_burned_liters=-1;assert.equal(data.parseMatchResult(invalid),null);
   assert.equal(data.parseMatchResult(match('duplicate',{participants:[participant('self','red'),participant('self','blue')]})),null);
   assert.equal(data.parseMatchResult(match('badplay',{play_of_game:{profile_id:'missing',start_s:1,end_s:2,score:1,kills:0,captures:0,damage:0}})),null);
   assert.equal(data.resultOutcome(match('win'),'self'),'victory');assert.equal(data.resultOutcome(match('lose',{winner:'blue'}),'self'),'defeat');
   assert.equal(data.resultOutcome(match('draw',{winner:null}),'self'),'draw');assert.equal(data.resultOutcome(match('training',{training:true}),'self'),'victory');
  });
  await t.test('live result renders all views, actual awards, saved styles and pending replay',async()=>{
   ui.setState({screen:'sandbox',overlay:null});assert.equal(store.receiveMatchResult(match('live')),true);await render();
   assert.match(document.querySelector('h1').textContent,/VICTORY/);assert.match(document.querySelector('.result-world').textContent,/COASTAL DISTRICT/);
   assert.equal(document.querySelectorAll('[role="tab"]').length,3);assert.equal(document.querySelectorAll('.result-award').length,4);
   assert.match(document.querySelector('.result-pending').textContent,/REPLAY CAPTURE · PENDING/);assert.equal(document.querySelector('video'),null);
   assert.match(document.querySelector('.result-highlight').textContent,/2 killing blows · 1 capture · 700 damage/);
   assert.equal(document.querySelectorAll('.result-award [data-style="factory"]').length,3);
   await act(async()=>document.getElementById('result-tab-stats').click());assert(document.querySelector('table'));assert.match(document.querySelector('.result-personal').textContent,/GAS BURNED/);
   await act(async()=>document.getElementById('result-tab-team').click());assert(document.querySelector('.match-team-composition'));assert.equal(ui.getState().screen,'sandbox');
  });
  await t.test('team result filters show all, red or blue via secondary actions without changing the result',async()=>{
   const saved=store.useMatchResultsStore.getState().record;
   await act(async()=>store.useMatchResultsStore.getState().selectTab('team'));
   assert.equal(document.querySelectorAll('.match-team-filter-tabs [role="tab"]').length,3);
   assert.equal(document.querySelectorAll('.match-team-composition .match-composition-team').length,2);
   await act(async()=>window.dispatchEvent(new CustomEvent('avenlab:panel-action',{detail:'next_option'})));
   assert.equal(store.useMatchResultsStore.getState().teamFilter,'red');assert.equal(document.querySelectorAll('.match-team-composition .match-composition-team').length,1);assert(document.querySelector('.match-team-composition [data-team="red"]'));
   await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit3',bubbles:true,cancelable:true})));
   assert.equal(store.useMatchResultsStore.getState().teamFilter,'blue');assert(document.querySelector('.match-team-composition [data-team="blue"]'));assert.match(document.querySelector('.scoreboard-player-details').textContent,/OTHER DRIVER/);
   assert.equal(store.useMatchResultsStore.getState().record,saved,'filtering never mutates archived match data');
   await act(async()=>store.useMatchResultsStore.getState().selectTab('stats'));await act(async()=>window.dispatchEvent(new CustomEvent('avenlab:panel-action',{detail:'next_option'})));assert.equal(store.useMatchResultsStore.getState().teamFilter,'blue','secondary filters only own Team view');
  });
  await t.test('read-only history restores caller on B and consumes the event before underlying selection',async()=>{
   await act(async()=>{ui.setState({screen:'sandbox',overlay:'career'});store.openStoredMatch({match:match('history')});});
   let underneath=0;const underlying=()=>{underneath++;};window.addEventListener('avenlab:panel-action',underlying);
   const before=sent.length;
   await act(async()=>window.dispatchEvent(new CustomEvent('avenlab:panel-action',{detail:'back'})));
   assert.equal(underneath,0);assert.equal(ui.getState().screen,'sandbox');assert.equal(ui.getState().overlay,'career');assert.equal(sent.length,before);
   window.removeEventListener('avenlab:panel-action',underlying);
   await act(async()=>{ui.setState({screen:'career',overlay:null});store.openStoredMatch(match('history-escape'));});
   let keys=0;const underneathKey=()=>{keys++;};window.addEventListener('keydown',underneathKey);
   await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape',bubbles:true,cancelable:true})));
   assert.equal(keys,0);assert.equal(ui.getState().screen,'career');assert.equal(ui.getState().overlay,null);assert.equal(sent.length,before);window.removeEventListener('keydown',underneathKey);
   await act(async()=>store.openStoredMatch(match('history-actions')));await act(async()=>playAgainFromResults());assert.equal(sent.length,before);assert.equal(ui.getState().screen,'career');
  });
  await t.test('live leave waits for acknowledgement; errors keep the archived result retryable',async()=>{
   await act(async()=>{ui.setState({screen:'sandbox',overlay:null});store.receiveMatchResult(match('leave'));});
   let leaving;await act(async()=>{leaving=leaveMatchResults();});const request=sent.at(-1);assert.equal(request.action,'mode_leave');assert.equal(ui.getState().overlay,'match_results');assert.equal(store.useMatchResultsStore.getState().busy,true);
   await act(async()=>reply(request,{},false,'Server unavailable'));await leaving;await flush();assert.equal(ui.getState().overlay,'match_results');assert.match(document.querySelector('[role="alert"]').textContent,/Server unavailable/);
   await act(async()=>{leaving=leaveMatchResults();});await act(async()=>reply(sent.at(-1)));await leaving;await flush();assert.equal(ui.getState().screen,'mode_select');assert.equal(ui.getState().overlay,null);
   assert.equal(store.receiveMatchResult(match('leave')),true);assert.equal(ui.getState().overlay,null,'duplicate result cannot reopen an acknowledged match');
  });
  await t.test('Play Again leaves then joins the original mode with real queued acknowledgement',async()=>{
   await act(async()=>{ui.setState({screen:'sandbox',overlay:null});store.receiveMatchResult(match('again',{mode:'skirmish'}));});
   let playing;await act(async()=>{playing=playAgainFromResults();});assert.equal(sent.at(-1).action,'mode_leave');
   await act(async()=>reply(sent.at(-1)));await flush();assert.equal(sent.at(-1).action,'mode_join');assert.equal(sent.at(-1).mode,'quickplay');assert.equal(sent.at(-1).team_size,3);assert.equal(ui.getState().overlay,'match_results');
   await act(async()=>reply(sent.at(-1),{status:'queued'}));await playing;await flush();assert.equal(ui.getState().screen,'queue');assert.equal(ui.getState().overlay,null);
  });
  await t.test('modern3v3 result composition and Play Again keep the Competitive format',async()=>{
   await act(async()=>{ui.setState({screen:'sandbox',overlay:null});store.receiveMatchResult(match('again3',{mode:'competitive',team_size:3}));});await render();
   assert.match(document.querySelector('.result-world').textContent,/COMPETITIVE · 3V3/);
   await act(async()=>store.useMatchResultsStore.getState().selectTab('team'));assert.equal(document.querySelectorAll('.match-composition-seat').length,6);
   let playing;await act(async()=>{playing=playAgainFromResults();});await act(async()=>reply(sent.at(-1)));await flush();assert.equal(sent.at(-1).mode,'competitive');assert.equal(sent.at(-1).team_size,3);
   await act(async()=>reply(sent.at(-1),{status:'queued',mode:'competitive',team_size:3}));await playing;await flush();assert.equal(ui.getState().screen,'queue');
  });
  await t.test('a late live acknowledgement cannot turn a same-match history detail into a queue request',async()=>{
   await act(async()=>{ui.setState({screen:'sandbox',overlay:null});store.receiveMatchResult(match('late-history'));});
   let playing;await act(async()=>{playing=playAgainFromResults();});const request=sent.at(-1),before=sent.length;
   await act(async()=>{ui.setState({screen:'career',overlay:null});store.openStoredMatch(match('late-history'));});
   await act(async()=>reply(request));await playing;await flush();
   assert.equal(sent.length,before);assert.equal(store.useMatchResultsStore.getState().source,'history');assert.equal(store.useMatchResultsStore.getState().leftWorld,false);assert.equal(ui.getState().overlay,'match_results');
  });
  await t.test('invalid/unrelated packets preserve visible record and no-data history remains honest',async()=>{
   await act(async()=>store.openStoredMatch(match('empty',{participants:[],play_of_game:null,winner:null,score:[0,0]})));assert.match(document.querySelector('h1').textContent,/SESSION COMPLETE/);assert.match(document.querySelector('.result-highlight').textContent,/No highlight was recorded/);
   assert.equal(store.receiveMatchResult(match('unrelated',{participants:[participant('stranger','blue')],play_of_game:null})),false);assert.equal(store.receiveMatchResult({match_id:'broken'}),false);assert.equal(store.useMatchResultsStore.getState().record.match_id,'empty');
  });
 }finally{client?.setSocialConnection(null);await act(async()=>root.unmount());await vite.close();dom.window.close();for(const[k,v]of original){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
});
