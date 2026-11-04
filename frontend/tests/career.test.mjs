import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('career records retain authoritative totals and profile-scoped request ownership',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),previous=new Map();
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,HTMLCanvasElement:dom.window.HTMLCanvasElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,KeyboardEvent:dom.window.KeyboardEvent,localStorage:dom.window.localStorage,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true})){
  previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 document.hasFocus=()=>true;dom.window.HTMLElement.prototype.scrollIntoView=()=>{};dom.window.HTMLElement.prototype.scrollTo=()=>{};
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}}),load=p=>vite.ssrLoadModule('/src/'+p),root=createRoot(document.getElementById('root'));
 let client;
 try{
  const data=await load('game/career/careerData.ts'),{CareerHistoryLoader}=await load('game/career/careerHistory.ts');
  const bucket=(sessions,kills=20)=>{const b=data.emptyCareerBucket();return {...b,sessions,matches:sessions,wins:sessions,totals:{...b.totals,kills,damage_dealt:12000,best_kill_streak:9,play_time_s:3000},best:{...b.best,kills:12,damage_dealt:4000,best_kill_streak:9},mvp:1};};
  const career={version:1,summary:{...bucket(5),matches:3},by_mode:{quickplay:bucket(2)},by_hero:{tank:bucket(4)},by_mode_hero:{quickplay:{tank:bucket(1)}},recent:[{match_id:'sample-only',hero:'tank',mode:'quickplay',stats:{kills:999}}]};
  await t.test('all/mode/hero/intersection use complete server indexes, never recent history',()=>{
   assert.equal(data.selectCareerBucket(career,'all','all'),career.summary);
   assert.equal(data.selectCareerBucket(career,'quickplay','all'),career.by_mode.quickplay);
   assert.equal(data.selectCareerBucket(career,'all','tank'),career.by_hero.tank);
   assert.equal(data.selectCareerBucket(career,'quickplay','tank'),career.by_mode_hero.quickplay.tank);
   assert.equal(data.selectCareerBucket({...career,by_mode_hero:undefined},'quickplay','tank'),undefined,'legacy missing intersection remains unavailable');
   assert.equal(data.selectCareerBucket(career,'competitive','tank').sessions,0,'known empty full index is zero');
   assert.equal(data.selectCareerBucket(undefined,'all','all'),undefined,'legacy unknown records are not reconstructed');
  });
  await t.test('averages use recorded sessions, best streak has no invented total/average',()=>{
   assert.equal(data.careerAverage(career.summary,'kills'),4);
   assert.equal(data.careerAverage(career.summary,'best_kill_streak'),undefined);
   assert.equal(data.careerAverage(data.emptyCareerBucket(),'kills'),undefined);
   assert.equal(data.formatCareerValue(undefined),'—');assert.equal(data.formatCareerValue(NaN),'—');
   assert.equal(data.formatCareerValue(3661,'duration'),'1h 1m');assert.equal(data.formatCareerValue(2.25,'liters'),'2.3 L');
   const entry={mode:'quickplay',hero:'tank',training:true};assert(data.historyMatchesFilters(entry,'training','tank'));assert(!data.historyMatchesFilters(entry,'quickplay','tank'));assert(data.historyMatchesFilters(entry,'all','all'));
  });
  await t.test('history forwards mode/hero filters and cursor and deduplicates pages',async()=>{
   const calls=[],queue=[{matches:[{match_id:'one'},{match_id:'one'}],next_cursor:'next'},{matches:[{match_id:'one'},{match_id:'two'}],next_cursor:null}];
   const loader=new CareerHistoryLoader(async(action,fields)=>{calls.push({action,fields});return queue.shift();},()=>{},'training','tank');
   await loader.loadMore();assert.deepEqual(calls[0],{action:'career_history',fields:{limit:20,mode:'training',hero:'tank'}});assert.equal(loader.state.matches.length,1);
   await loader.loadMore();assert.equal(calls[1].fields.cursor,'next');assert.deepEqual(loader.state.matches.map(x=>x.match_id),['one','two']);await loader.loadMore();assert.equal(calls.length,2,'end of history does not fetch repeatedly');
  });
  await t.test('history failure preserves loaded rows and cursor for retry; unreadable pages stay errors',async()=>{
   let attempt=0;const calls=[];
   const loader=new CareerHistoryLoader(async(_action,fields)=>{calls.push(fields);attempt++;if(attempt===1)return {matches:[{match_id:'one'}],next_cursor:'cursor'};if(attempt===2)throw Error('Offline');if(attempt===3)return {matches:[{match_id:'two'}],next_cursor:3};return {matches:[{match_id:'two'}],next_cursor:null};},()=>{});
   await loader.loadMore();await loader.loadMore();assert.equal(loader.state.error,'Offline');assert.equal(loader.state.matches[0].match_id,'one');assert.equal(loader.state.cursor,'cursor');
   await loader.loadMore();assert.match(loader.state.error,/unreadable/);await loader.loadMore();assert.equal(loader.state.error,'');assert.equal(loader.state.matches.length,2);assert(calls.slice(1).every(fields=>fields.cursor==='cursor'));
  });
  await t.test('inflight pages cannot double-fetch or leak into another profile/filter after disposal',async()=>{
   const request=deferred(),changes=[];let count=0;
   const old=new CareerHistoryLoader(async()=>{count++;return request.promise;},state=>changes.push(state));
   const first=old.loadMore();await old.loadMore();assert.equal(count,1);old.dispose();const before=changes.length;
   const next=new CareerHistoryLoader(async()=>({matches:[{match_id:'new-profile'}],next_cursor:null}),()=>{},'competitive','brz');await next.loadMore();
   request.resolve({matches:[{match_id:'old-profile'}],next_cursor:null});await first;assert.equal(changes.length,before);assert.equal(old.state.matches.length,0);assert.equal(next.state.matches[0].match_id,'new-profile');
  });
  await t.test('opening history is read-only, validates the returned record and ignores late opens',async()=>{
   const calls=[];let accept=false;const record={match_id:'full'};
   const loader=new CareerHistoryLoader(async(action,fields)=>{calls.push({action,fields});return {match:record};},()=>{});
   let opened;await loader.openMatch('full',value=>{opened=value;return accept;});assert.equal(opened,record);assert.match(loader.state.error,/could not be displayed/);
   accept=true;await loader.openMatch('full',()=>true);assert.equal(loader.state.error,'');assert.equal(loader.state.opening,null);assert(calls.every(call=>call.action==='career_match'));assert.deepEqual(calls[0].fields,{match_id:'full'});
   const delayed=deferred();let late=0;const old=new CareerHistoryLoader(()=>delayed.promise,()=>{});const opening=old.openMatch('old',()=>{late++;return true;});old.dispose();delayed.resolve({match:record});await opening;assert.equal(late,0);
  });
  const {CareerMenu}=await load('game/menus/CareerMenu.tsx'),{useCareerViewStore:navigation}=await load('game/career/careerViewStore.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),{usePreferencesStore:preferences}=await load('store/preferences/preferencesStore.ts');
  const {CareerStatistics,CareerRecordNotice}=await load('game/career/CareerStatistics.tsx');client=await load('net/socialClient.ts');
  const sent=[];client.setSocialConnection({readyState:WebSocket.OPEN,send:body=>sent.push(JSON.parse(body))});
  const progression={default_hero:'tank',hero_loadouts:{},level:12,prestige:0,xp:50,required_xp:100,tier:'Bronze',competitive_wins:1,quickplay_wins:2,matches:3,credits:3,owned:['factory'],equipped:'factory',color:'#fff',next_milestone:20,career};
  social.setState({view:{profile:{id:'owner',name:'CAREER DRIVER',progression},worlds:[],alpha:{skins:[{id:'factory',name:'Factory',color:'#fff',cost:0},{id:'pink',name:'Pink',color:'#ff00bb',cost:1}]}}});ui.setState({screen:'career',overlay:null});
  const tab=async name=>act(async()=>navigation.getState().selectTab(name));
  await t.test('career shares header/footer, presents real bests, and preserves progression/favorites/skin/achievement tools',async()=>{
   await act(async()=>root.render(h(CareerMenu)));assert.equal(document.querySelector('.alpha-header h1').textContent,'CAREER');assert(document.querySelector('.alpha-selection-footer .controller-key'));assert.equal(document.querySelectorAll('[role="tab"]').length,8);
   assert.match(document.querySelector('.career-profile-strip').textContent,/CAREER DRIVER/);assert.match(document.querySelector('.career-metrics').textContent,/4,000/);
   await tab('statistics');assert.match(document.querySelector('thead').textContent,/Avg \/ session/);const streak=[...document.querySelectorAll('tbody tr')].find(row=>row.textContent.includes('Best elimination streak'));assert.deepEqual([...streak.querySelectorAll('td')].map(x=>x.textContent),['—','9','—']);
   await tab('progression');assert.match(document.querySelector('.career-tools').textContent,/Bronze · 1 wins/);
   await tab('favorites');const favorite=document.querySelector('.career-tool-row'),vehicle=favorite.dataset.menuRow,before=preferences.getState().favoriteVehicles.includes(vehicle);await act(async()=>favorite.click());assert.equal(preferences.getState().favoriteVehicles.includes(vehicle),!before);assert.equal(social.getState().view.profile.progression.default_hero,'tank');
   await tab('customize');assert.match(document.querySelector('.career-tools').textContent,/Skin vouchers/);const pink=document.querySelector('[data-menu-row="pink"]');let pending;await act(async()=>pink.click());pending=sent.at(-1);assert.equal(pending.action,'skin_redeem');assert.equal(pending.skin,'pink');await act(async()=>client.receiveSocialResult({request_id:pending.request_id,ok:true,data:{}}));
   await tab('achievements');assert.match(document.querySelector('.career-tools').textContent,/not tracked, earned or claimable/);await tab('leaderboard');assert.match(document.querySelector('.career-empty').textContent,/Ranked standings are pending/);
  });
  await t.test('changing the authenticated profile immediately clears history and ignores its pending page',async()=>{
   await tab('history');const first=sent.at(-1);assert.equal(first.action,'career_history');
   const entry={match_id:'old-owner',mode:'quickplay',training:true,hero:'tank',map:'coastal_district',ended_at:1793701000,duration_s:120,outcome:'win',awards:[]};
   await act(async()=>client.receiveSocialResult({request_id:first.request_id,ok:true,data:{matches:[entry],next_cursor:'page-two'}}));assert.equal(document.querySelectorAll('.career-history-row').length,1);assert.match(document.querySelector('.career-history-result strong').textContent,/WIN · TRAINING/);
   await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='LOAD MORE').click());const stale=sent.at(-1);
   await act(async()=>social.setState({view:{...social.getState().view,profile:{id:'next-owner',name:'NEXT DRIVER',progression:{...progression,career:undefined}}}}));const fresh=sent.at(-1);assert.notEqual(fresh.request_id,stale.request_id);assert.equal(document.querySelectorAll('.career-history-row').length,0,'no previous profile rows survive the owner change');
   await act(async()=>client.receiveSocialResult({request_id:stale.request_id,ok:true,data:{matches:[{...entry,match_id:'old-late'}],next_cursor:null}}));assert.equal(document.querySelectorAll('.career-history-row').length,0);
   await act(async()=>client.receiveSocialResult({request_id:fresh.request_id,ok:true,data:{matches:[],next_cursor:null}}));assert.match(document.querySelector('.career-empty').textContent,/No recorded matches yet/);
  });
  await t.test('legacy/empty statistics do not manufacture past performance',async()=>{
   await act(async()=>root.render(h('div',null,h(CareerRecordNotice,{career:undefined,bucket:undefined}),h(CareerStatistics,{bucket:undefined}))));assert.match(document.body.textContent,/historical performance has not been reconstructed/);assert([...document.querySelectorAll('tbody td')].every(cell=>cell.textContent==='—'));
   await act(async()=>root.render(h(CareerStatistics,{bucket:bucket(2)})));assert.match(document.querySelector('thead').textContent,/Avg \/ match/);
  });
 }finally{client?.setSocialConnection(null);await act(async()=>root.unmount());await vite.close();dom.window.close();for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
