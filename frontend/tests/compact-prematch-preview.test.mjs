import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h,Fragment} from 'react';
import {createRoot} from 'react-dom/client';

const secretStyle={body:'#e300a2',finish:'frs',seats:'black',skin:'factory'};
const makeView=(size=3)=>({
 profile:{id:'local-profile',name:'Local Driver'},players:[],teammates:[],requests:[],groups:[],world_invites:[],maps:['road_precision'],current_world_id:7,
 limits:{active_worlds:1,max_active_worlds:3,active_players:2,max_players:24},
 worlds:[{id:7,name:'Coast',map:'road_precision',owner_id:null,listed:true,locked:false,max_players:2*size,players:2,active:true,invite_code:null,members:[{player_id:'local',profile_id:'local-profile',name:'Local Driver',team:'red',level:12},{player_id:'opponent',profile_id:'enemy-profile',name:'Opponent',team:'blue',level:9}]}],
 alpha:{enabled:true,role_limits:true,skins:[],queue:null,reconnect_grace_seconds:30,reserved_players:0,
  active:{mode:'quickplay',world_id:7,team:'red',hero:'',team_size:size,capacity:2*size,match_id:'round-seven',match_phase:'waiting'},
  roster:[{id:'local-profile',name:'Local Driver',team:'red',hero:'brz',mode:'quickplay',world_id:7,reconnecting:false,hero_hidden:false},
   {id:'enemy-profile',name:'Opponent',team:'blue',hero:'tank',showcase_hero:'supra',appearance:secretStyle,mode:'quickplay',world_id:7,reconnecting:true,hero_hidden:false}]}
});

test('compact prematch views share a frame and keep opposing picks mysterious until server start',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map(),frames=new Map();let serial=0,vite,root;
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,HTMLSelectElement:dom.window.HTMLSelectElement,Node:dom.window.Node,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:callback=>{frames.set(++serial,callback);return serial;},cancelAnimationFrame:id=>frames.delete(id)})){
  old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 document.hasFocus=()=>true;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
 dom.window.HTMLMediaElement.prototype.play=async()=>{};dom.window.HTMLMediaElement.prototype.pause=()=>{};
 HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.attachEvent=()=>{};HTMLElement.prototype.detachEvent=()=>{};
 const pad={connected:true,index:0,id:'prematch-tabs',axes:[0,0,0,0],buttons:Array.from({length:18},()=>({pressed:false,value:0}))};navigator.getGamepads=()=>[pad];
 const poll=()=>act(async()=>{const next=frames.entries().next().value;assert(next);const[id,callback]=next;frames.delete(id);callback(performance.now());});
 const press=async(index,held)=>{pad.buttons[index]={pressed:held,value:Number(held)};await poll();};
 try{
  vite=await createServer({cacheDir:'node_modules/.vite-compact-prematch',server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}});
  const load=path=>vite.ssrLoadModule('/src/'+path);
  const {PreMatchTeamPreview}=await load('game/stats/PreMatchTeamPreview.tsx'),{preMatchPlayers,preMatchEnemiesRevealed,scoreboardPlayers}=await load('game/stats/scoreboardData.ts');
  const {useNetworkStore:network}=await load('store/session/networkStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts'),{useAlphaStore:alpha}=await load('store/alpha/alphaStore.ts');
  root=createRoot(document.getElementById('root'));
  const render=async node=>{await act(async()=>root.render(null));await act(async()=>root.render(node));};
  const click=selector=>act(async()=>document.querySelector(selector).click());
  await t.test('authoritative phase and round metadata are required; snapshots cannot guess a reveal',()=>{
   const view=makeView();assert.equal(preMatchEnemiesRevealed(view,true),false);
   for(const phase of ['running','overtime','ended']){view.alpha.active.match_phase=phase;assert.equal(preMatchEnemiesRevealed(view,true),true);assert.equal(preMatchEnemiesRevealed(view,false),false);}
   view.alpha.active.match_phase='waiting';assert.equal(preMatchEnemiesRevealed(view,true),false);
   delete view.alpha.active.match_phase;assert.equal(preMatchEnemiesRevealed(view,true),false,'missing old-server phase stays private');
   view.alpha.active.match_phase='running';view.alpha.active.match_id='';assert.equal(preMatchEnemiesRevealed(view,true),false);
   view.alpha.active.match_id='round-seven';view.current_world_id=8;assert.equal(preMatchEnemiesRevealed(view,true),false,'another current world cannot reveal the old roster');
   view.current_world_id=7;view.alpha.active.world_id=0;assert.equal(preMatchEnemiesRevealed(view,true),false);
  });
  await t.test('waiting projection removes enemy hero, showcase paint, role hints and readiness while preserving allies',()=>{
   const view=makeView(),enemy=preMatchPlayers(view).find(player=>player.profileId==='enemy-profile');
   assert.equal(enemy.heroHidden,true);assert.equal(enemy.hero,null);assert.equal(enemy.appearance,null);assert.equal(enemy.status,undefined);assert.equal(enemy.stats,null);
   assert.equal(preMatchPlayers(view).find(player=>player.self).hero,'brz');assert.equal(enemy.name,'Opponent');
   view.alpha.active.match_phase='running';const shown=preMatchPlayers(view,preMatchEnemiesRevealed(view,true)).find(player=>player.profileId==='enemy-profile');assert.equal(shown.hero,'tank');assert.equal(shown.appearance.body,secretStyle.body);
  });
  await t.test('explicit server privacy wins over stale vehicle models, showcase fallback and a running phase',async()=>{
   const view=makeView();view.alpha.active.match_phase='running';const card=view.alpha.roster[1];card.hero_hidden=true;card.hero='';card.showcase_hero='supra';card.appearance=null;
   const snapshot={tick:1,entities:[{id:'opponent',room_id:7,vehicle_id:'tank',team:'blue',appearance:secretStyle,health:{hp:100,max_hp:1200,kills:9,deaths:3}}]};
   const stale=scoreboardPlayers(snapshot,'local',view).find(player=>player.profileId==='enemy-profile');assert.equal(stale.heroHidden,true);assert.equal(stale.hero,null);assert.equal(stale.appearance,null);assert.equal(stale.kills,null);assert.equal(stale.status,undefined);
   const absent=preMatchPlayers(view,true).find(player=>player.profileId==='enemy-profile');assert.equal(absent.hero,null);assert.equal(absent.appearance,null);
   const accepted=structuredClone(view);accepted.alpha.skins=[];await act(async()=>social.getState().receive(accepted));assert.equal(social.getState().view.alpha.roster[1].appearance,null,'hidden nullable appearance is a valid social view');
  });
  await t.test('three and five seat pickers show only own slots without a toolbar',async()=>{
   for(const size of [3,5]){
    const view=makeView();view.alpha.active.team_size=size;await render(h(PreMatchTeamPreview,{view,selectedHero:'brz'}));
    assert.equal(document.querySelectorAll('.team-portrait-badge').length,size);
    assert.equal(document.querySelector('[role=tablist],.prematch-preview-toolbar,.match-stats-table'),null);
    assert.equal(document.querySelector('[data-team=blue]'),null);
    assert(document.querySelector('[data-self=true]'));
   }
  });
  await t.test('empty seats survive showcase heroes, rejected picks and clearing the local choice',async()=>{
   const view=makeView(5);view.alpha.roster[0].showcase_hero='brz';view.alpha.roster[0].hero='';
   await render(h(PreMatchTeamPreview,{view,selectedHero:null}));
   assert.deepEqual([...document.querySelectorAll('.team-portrait-ellipsis')].map(node=>node.textContent),Array(5).fill('...'));
   await render(h(PreMatchTeamPreview,{view,selectedHero:'brz'}));
   assert.equal(document.querySelectorAll('.team-portrait-ellipsis').length,4);
   assert.match(document.querySelector('[data-self=true] img').src,/brz\.webp/);
   assert.equal(document.querySelector('.prematch-team-preview strong').textContent,'Local Driver');
   await render(h(PreMatchTeamPreview,{view,selectedHero:null}));
   assert.equal(document.querySelectorAll('.team-portrait-ellipsis').length,5);
  });
  await t.test('the confirmed lineup opens over video once per round and enables swaps only at spawn',async()=>{
   const {TeamLineup}=await load('game/stats/TeamLineup.tsx');
   const {PauseMenu}=await load('game/menus/PauseMenu.tsx');
   const {routeMenuAction}=await load('controls/inputRouting.ts');
   const {ResourceFlags}=await load('store/telemetry/resourceMasks.ts');
   const view=makeView();
   view.profile.progression={level:12};
   view.alpha.active.hero='brz';
   view.alpha.roster.push(
    {id:'ally',name:'Atlas',team:'red',hero:'tank',mode:'quickplay',world_id:7,reconnecting:false},
    {id:'third',name:'Nova',team:'red',hero:'',showcase_hero:'cx30',mode:'quickplay',world_id:7,reconnecting:false});
   view.worlds[0].members.push({player_id:'ally',profile_id:'ally',name:'Atlas',team:'red',level:8});
   const snapshot=(atSpawn,matchId='round-seven')=>({tick:1,match_state:{match_id:matchId,phase:'waiting'},
    entities:[{id:'local',room_id:7,team:'red',vehicle_id:'brz',resource_mask:atSpawn?ResourceFlags.CAN_CHANGE_HERO:0}]});
   await act(async()=>{
    ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});social.setState({view});
    network.setState({connected:true,playerId:'local',room_id:7,snapshot:snapshot(true)});
   });
   await render(h(TeamLineup));
   assert.equal(document.querySelector('.team-lineup'),null,'a showcase is not a confirmed pick');
   const ready=structuredClone(view);
   ready.alpha.roster.at(-1).hero='cx30';
   await act(async()=>{social.setState({view:ready});network.setState({snapshot:snapshot(true,'old-round')});});
   assert.equal(document.querySelector('.team-lineup'),null,'a snapshot from another round cannot open the lineup');
   await act(async()=>network.setState({snapshot:snapshot(true)}));
   assert(document.querySelector('.team-lineup video'));
   assert.equal(document.querySelectorAll('.team-lineup-card').length,3);
   assert.match(document.querySelector('.team-lineup-card[data-self=true]').textContent,/dpsLevel 12BRZLocal Driver/);
   assert.match(document.querySelector('.team-lineup-cards').textContent,/Level 8VANGUARDAtlas/);
   assert.doesNotMatch(document.querySelector('.team-lineup-cards').textContent,/Opponent/);
   const changeHero = '.team-lineup-actions button:first-child';
   assert.equal(document.querySelector(changeHero).disabled,false);
   await act(async()=>{routeMenuAction('left');routeMenuAction('activate');});
   assert.equal(ui.getState().overlay,'vehicle_select');
   await act(async()=>ui.getState().backToParentMenu());
   assert.equal(ui.getState().overlay,'team_lineup');
   await act(async()=>network.setState({snapshot:snapshot(false)}));
   assert.equal(document.querySelector(changeHero).disabled,true);
   assert.equal(document.querySelector('.team-lineup-actions button:last-child'),document.activeElement);
   await click(changeHero);
   await act(async()=>{routeMenuAction('left');ui.getState().openVehicleSelection();});
   assert.equal(document.querySelector('.team-lineup-actions button:last-child'),document.activeElement);
   assert.equal(ui.getState().overlay,'team_lineup');
   await act(async()=>routeMenuAction('back'));
   assert.equal(ui.getState().overlay,null);
   await act(async()=>network.setState({snapshot:snapshot(true)}));
   assert.equal(ui.getState().overlay,null,'returning to spawn does not replay the video');
   await act(async()=>ui.getState().openVehicleSelection());
   assert.equal(ui.getState().overlay,'vehicle_select');
   await act(async()=>{network.setState({snapshot:snapshot(false)});ui.getState().openPause();});
   await render(h(PauseMenu));
   const pauseChangeHero = '[data-pause-action=vehicle_select]';
   assert.equal(document.querySelector(pauseChangeHero).getAttribute('aria-disabled'),'true');
   await act(async()=>{ui.getState().setActiveMenuIndex(0);routeMenuAction('up');});
   assert.equal(document.activeElement.getAttribute('data-pause-action'),'cockpit');
   await act(async()=>network.setState({snapshot:snapshot(true)}));
   assert.equal(document.querySelector(pauseChangeHero).getAttribute('aria-disabled'),'false');
   assert.equal(document.querySelector(pauseChangeHero).getAttribute('aria-label'),'Change hero');
  });
  await t.test('holding Tab shows privacy-filtered stats with no vehicle and release closes stats',async()=>{
   const {Keyboard}=await vite.ssrLoadModule('/src/controls/Keyboard.ts');
   const {MatchScoreboard}=await vite.ssrLoadModule('/src/game/stats/MatchScoreboard.tsx');
   const view=makeView();
   await act(async()=>{network.setState({connected:true,playerId:'me',room_id:7,snapshot:null});social.setState({view});ui.setState({screen:'hero_select',overlay:null,isModeLoading:false});});
   await render(h(Fragment,null,h(Keyboard),h(MatchScoreboard)));
   const key=async(type)=>act(async()=>window.dispatchEvent(new window.KeyboardEvent(type,{key:'Tab',code:'Tab',bubbles:true,cancelable:true})));
   await key('keydown');assert(document.querySelector('.match-stats-table'));assert.match(document.querySelector('.match-stats-table').textContent,/MYSTERY HERO/);
   await key('keyup');assert.equal(document.querySelector('.match-scoreboard'),null);
  });
 }finally{if(root)await act(async()=>root.unmount());await vite?.close();dom.window.close();for(const[key,value]of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});
