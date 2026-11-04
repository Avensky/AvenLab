import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {createElement as h,act} from 'react';
import {createRoot} from 'react-dom/client';
const appearance={body:'#d61f86',finish:'frs',seats:'black',skin:'factory'};
const stats={damage_dealt:450,healing_done:90,self_healing:30,gas_burned_liters:8,gas_gained_liters:4,assists:2,resurrections:0,respawns:1,best_kill_streak:3,current_kill_streak:2};
const player=(id,team)=>({id,profileId:`profile:${id}`,name:id,team,self:id==='Local',hero:'brz',appearance:null,waiting:false,defeated:false,kills:4,deaths:2,stats:{...stats},level:8,status:'active'});
const entity=(id,team)=>({id,kind:'car',vehicle_id:'brz',team,room_id:7,position:[0,1,0],rotation:[0,0,0,1],vehicle_mask:1,player_mask:0,speed:0,health:{hp:300,max_hp:500,defeated:false,kills:4,deaths:2,stats:{...stats}}});
const view=()=>({profile:{id:'profile:Local',name:'Local',progression:{level:12,hero_loadouts:{brz:appearance}}},players:[],teammates:[],requests:[],groups:[],world_invites:[],current_world_id:7,worlds:[{id:7,name:'Coast',members:[{player_id:'Local',profile_id:'profile:Local',name:'Local',team:'blue',level:12},{player_id:'Remote',profile_id:'profile:Remote',name:'Remote',team:'red',level:8}]}],alpha:{active:{mode:'quickplay',world_id:7,hero:'brz',team:'blue'},roster:[{id:'profile:Local',name:'Local',team:'blue',hero:'brz',world_id:7,mode:'quickplay',reconnecting:false},{id:'profile:Remote',name:'Remote',team:'red',hero:'brz',world_id:7,mode:'quickplay',reconnecting:false},{id:'outside',name:'Wrong World',team:'red',hero:'tank',world_id:9,mode:'quickplay',reconnecting:false}]}});

test('team and table presentations retain authoritative identities, styles and honest unavailable totals',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map();let server,root;
 for(const[k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}
 try{
  server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});const load=p=>server.ssrLoadModule('/src/'+p);
  const {MatchTeamComposition,MatchStatsTable,MatchPlayerDetails,MatchTeamFilterTabs}=await load('game/stats/MatchPresentation.tsx');
  const {PreMatchTeamPreview}=await load('game/stats/PreMatchTeamPreview.tsx');
  const {preMatchPlayers,scoreboardPlayers}=await load('game/stats/scoreboardData.ts');
  const {useScoreboardStore:board}=await load('store/hud/scoreboardStore.ts');
  root=createRoot(document.getElementById('root'));
  const render=async element=>act(async()=>root.render(element));
  await t.test('a new live round defaults to table and a deliberate view survives repeated opens',()=>{
   assert.equal(board.getState().view,'table');board.getState().setView('composition');board.getState().setHeld(true);board.getState().close();board.getState().toggle();assert.equal(board.getState().view,'composition');board.getState().setTeamFilter('red');board.getState().cycleTeamFilter(1);assert.equal(board.getState().teamFilter,'blue');board.getState().cycleTeamFilter(1);assert.equal(board.getState().teamFilter,'all');board.getState().cycleTeamFilter(-1);assert.equal(board.getState().teamFilter,'blue');board.getState().resetView();assert.equal(board.getState().view,'table');assert.equal(board.getState().teamFilter,'all');board.getState().close();
  });
  await t.test('pre-deployment shows five own-team slots and keeps enemy cards out of both views',async()=>{
   const v=view(),rows=preMatchPlayers(v);assert.equal(rows.length,2);assert.equal(rows.find(row=>row.self).appearance.body,appearance.body);assert.equal(rows.find(row=>row.self).stats,null);assert.equal(rows.some(row=>row.name==='Wrong World'),false);
   await render(h(PreMatchTeamPreview,{view:v}));assert.equal(document.querySelectorAll('.match-composition-seat').length,5);assert.equal(document.querySelector('[data-match-view]'),null);assert.equal(document.querySelectorAll('.match-composition-row').length,1);assert.equal(document.querySelector('[data-team=blue] [data-self=true] strong').textContent,'Local');assert.equal(document.querySelector('[data-team=red]'),null);assert.equal(document.querySelector('[data-player-id=Remote]'),null);assert(document.querySelector('.match-composition-info>small'));assert.equal(document.querySelector('[data-team=blue] [data-self=true] .hero-portrait-art').style.getPropertyValue('--portrait-paint'),appearance.body);
   assert.equal(document.querySelector('.match-stats-table'),null);
  });
  await t.test('a missing confirmed team never exposes either roster',async()=>{
   const v=view();v.alpha.active.team=null;await render(h(PreMatchTeamPreview,{view:v}));assert.equal(document.querySelectorAll('.match-composition-seat').length,0);assert.match(document.body.textContent,/Waiting for your confirmed team/);
  });
  await t.test('secondary team filters show all, red or blue without changing player data',async()=>{
   const rows=[player('Local','blue'),player('Remote','red')];
   function Filtered(){const filter=board(state=>state.teamFilter);return h('div',null,h(MatchTeamFilterTabs,{filter,onChange:board.getState().setTeamFilter}),h(MatchTeamComposition,{players:rows,teamFilter:filter}));}
   board.getState().setTeamFilter('all');await render(h(Filtered));assert.equal(document.querySelectorAll('.match-composition-seat').length,10);
   assert(document.querySelector('[data-controller-key=LT]'));assert(document.querySelector('[data-controller-key=RT]'));
   await act(async()=>document.querySelector('[data-team-filter=red]').click());assert.equal(board.getState().teamFilter,'red');assert.equal(document.querySelectorAll('.match-composition-seat').length,5);assert.equal(document.querySelector('[data-team=blue]'),null);assert.match(document.body.textContent,/Remote/);
   await act(async()=>document.querySelector('[data-team-filter=red]').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));assert.equal(board.getState().teamFilter,'blue');assert.equal(document.querySelector('[data-team=red]'),null);assert.match(document.body.textContent,/Local/);assert.equal(document.activeElement.dataset.teamFilter,'blue');
   await act(async()=>board.getState().setTeamFilter('all'));assert.equal(document.querySelectorAll('.match-composition-seat').length,10);
  });
  await t.test('portrait inspection is click only and never swaps red/blue or borrows local style for same hero',async()=>{
   const local=player('Local','blue'),remote=player('Remote','red');remote.status='reconnecting';let selected='Local';
   await render(h(MatchTeamComposition,{players:[local,remote],selectedId:selected,onSelect:id=>{selected=id;}}));
   const button=document.querySelector('[data-player-id=Remote]');await act(async()=>button.dispatchEvent(new window.MouseEvent('pointerover',{bubbles:true})));await act(async()=>button.focus());assert.equal(selected,'Local');await act(async()=>button.click());assert.equal(selected,'Remote');assert.match(button.textContent,/RECONNECTING/);assert(button.closest('[data-team=red]'));assert.equal(button.querySelector('.hero-portrait-art').style.getPropertyValue('--portrait-paint'),'#bac5cf');assert.equal(document.querySelectorAll('[data-result-player]').length,2);
  });
  await t.test('table exposes combat columns while selected details include fuel and confirmed streaks',async()=>{
   const rows=[player('Local','blue'),player('Remote','red')];await render(h('div',null,h(MatchStatsTable,{players:rows}),h(MatchPlayerDetails,{player:rows[0]})));assert.deepEqual([...document.querySelector('thead tr').children].map(node=>node.textContent),['PLAYER / VEHICLE','K','A','D','DAMAGE','HEALING']);assert.equal(document.querySelectorAll('tbody tr[data-player-id]').length,2);assert.match(document.querySelector('.scoreboard-player-details').textContent,/GAS BURNED8\.0 L/);assert.match(document.querySelector('.scoreboard-player-details').textContent,/BEST STREAK3/);
  });
  await t.test('old HP-only snapshots show unknown combat data and no invented streak, level or healing',async()=>{
   const old=entity('Remote','red');delete old.health.stats;delete old.health.kills;delete old.health.deaths;const v=view();v.worlds[0].members=[];v.alpha.roster=[];
   const row=scoreboardPlayers({entities:[old]},'Remote',null)[0];assert.equal(row.stats,null);assert.equal(row.level,null);await render(h(MatchPlayerDetails,{player:row}));assert.match(document.body.textContent,/HEALING DONE—/);assert.match(document.body.textContent,/BEST STREAK—/);
  });
 }finally{if(root)await act(async()=>root.unmount());await server?.close();dom.window.close();for(const[k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
});
