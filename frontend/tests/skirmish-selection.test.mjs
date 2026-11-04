import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';

test('match category and size select independently through real admission and authoritative team capacity',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true}),original=new Map();
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,HTMLSelectElement:dom.window.HTMLSelectElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){
  original.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};dom.window.HTMLElement.prototype.scrollTo=()=>{};dom.window.HTMLElement.prototype.attachEvent=()=>{};dom.window.HTMLElement.prototype.detachEvent=()=>{};
 dom.window.HTMLMediaElement.prototype.play=async()=>{};dom.window.HTMLMediaElement.prototype.pause=()=>{};
 const vite=await createServer({cacheDir:'node_modules/.vite-skirmish-selection',server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}}),load=p=>vite.ssrLoadModule('/src/'+p),root=createRoot(document.getElementById('root'));
 try{
  const {useAlphaStore:alpha,isMatchMode,modeTeamSize,gameModeLabel,matchModeLabel,GAME_MODES}=await load('store/alpha/alphaStore.ts');
  const {useSocialStore:social}=await load('store/social/socialStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),{useNetworkStore:network}=await load('store/session/networkStore.ts');
  const client=await load('net/socialClient.ts'),{routeMenuAction:route}=await load('controls/inputRouting.ts'),sent=[];
  client.setSocialConnection({readyState:WebSocket.OPEN,send:body=>sent.push(JSON.parse(body))});
  const active={mode:'skirmish',world_id:4,team:'red',hero:'',team_size:3,capacity:6,role_caps:{tank:1,dps:1,support:1},role_minimums:{tank:1,dps:1,support:1}};
  const view={profile:{id:'me',name:'Driver'},players:[],teammates:[],requests:[],groups:[],worlds:[],world_invites:[],maps:[],current_world_id:null,limits:{max_active_worlds:3,active_worlds:0,max_players:10,active_players:0},alpha:{enabled:true,role_limits:true,active:null,queue:null,roster:[],reconnect_grace_seconds:30,reserved_players:0,skins:[]}};
  const render=async Component=>{await act(async()=>root.render(null));await act(async()=>root.render(h(Component)));};
  await t.test('metadata removes the duplicate size mode and normalizes legacy3v3 admissions',()=>{
   assert.equal(GAME_MODES.filter(m=>m.id==='skirmish').length,0);assert.equal(gameModeLabel('skirmish'),'QUICKPLAY');assert.equal(matchModeLabel('competitive',3),'COMPETITIVE · 3V3');assert.equal(isMatchMode('skirmish'),true);assert.equal(isMatchMode('editor'),false);assert.equal(modeTeamSize('skirmish'),3);assert.equal(modeTeamSize('quickplay'),5);assert.equal(modeTeamSize('quickplay',3),3);assert.equal(modeTeamSize('skirmish',99),3);alpha.getState().chooseMode('skirmish');assert.equal(alpha.getState().mode,'quickplay');assert.equal(alpha.getState().teamSize,3);
  });
  await t.test('two size-only portraits select on click/A while category stays unchanged',async()=>{
   const {ModeSelection}=await load('game/alpha/ModeSelection.tsx');
   await act(async()=>{alpha.setState({mode:'quickplay',teamSize:5,hero:null,previewHero:null});social.setState({view,profileStatus:'ready'});network.setState({connected:true});ui.setState({screen:'mode_select',overlay:null,isModeLoading:false});});await render(ModeSelection);
   const cards=[...document.querySelectorAll('[data-match-size]')];assert.equal(cards.length,2);assert(cards.every(card=>card.querySelector('img')),'real portrait assets are visible');assert.deepEqual(cards.map(card=>card.textContent),['3V3','5V5']);assert.deepEqual([...document.querySelectorAll('.alpha-mode-tabs [role=tab]')].map(tab=>tab.textContent),['QUICKPLAY','COMPETITIVE']);
   const small=document.querySelector('[data-match-size="3"]');await act(async()=>{small.dispatchEvent(new Event('pointerenter'));small.focus();});assert.equal(alpha.getState().mode,'quickplay');assert.equal(alpha.getState().teamSize,5);assert.equal(sent.length,0);
   await act(async()=>route('activate'));assert.equal(alpha.getState().mode,'quickplay');assert.equal(alpha.getState().teamSize,3);assert.equal(sent.length,0,'first A previews a different format');
   assert.equal(document.querySelector('[data-match-size="3"]').getAttribute('aria-pressed'),'true');assert.match(document.querySelector('[aria-label="Selected game mode"]').textContent,/3 VS 3/);
   await act(async()=>route('activate'));const request=sent.at(-1);assert.equal(request.action,'mode_join');assert.equal(request.mode,'quickplay');assert.equal(request.team_size,3);assert.equal(request.hero,'','format selection does not claim a role');
   await act(async()=>client.receiveSocialResult({request_id:request.request_id,ok:true,data:{status:'joined',mode:'quickplay',team_size:3,hero:''}}));assert.equal(ui.getState().screen,'hero_select');assert.equal(alpha.getState().mode,'quickplay');assert.equal(alpha.getState().teamSize,3);
  });
  await t.test('both categories join either size and controller tabs cannot overwrite the format',async()=>{
   const {ModeSelection}=await load('game/alpha/ModeSelection.tsx');
   for(const mode of ['quickplay','competitive'])for(const teamSize of [3,5]){
    await act(async()=>{alpha.setState({mode,teamSize:teamSize===3?5:3});social.setState({view,profileStatus:'ready'});ui.setState({screen:'mode_select',overlay:null});});await render(ModeSelection);
    await act(async()=>document.querySelector(`[data-match-size="${teamSize}"]`).click());assert.equal(alpha.getState().mode,mode);assert.equal(alpha.getState().teamSize,teamSize);
    await act(async()=>route('next_tab'));assert.equal(alpha.getState().mode,mode==='quickplay'?'competitive':'quickplay');assert.equal(alpha.getState().teamSize,teamSize);
    await act(async()=>route('previous_tab'));assert.equal(alpha.getState().mode,mode);
    await act(async()=>route('activate'));const request=sent.at(-1);assert.equal(request.action,'mode_join');assert.equal(request.mode,mode);assert.equal(request.team_size,teamSize);
    await act(async()=>client.receiveSocialResult({request_id:request.request_id,ok:true,data:{status:'queued',mode,team_size:teamSize}}));assert.equal(ui.getState().screen,'queue');
   }
  });
  await t.test('Explore & Build keeps tools accessible and Play restores the match category and size',async()=>{
   const {MAIN_MENU_ITEMS}=await load('game/menus/menuItems.ts'),{ModeSelection}=await load('game/alpha/ModeSelection.tsx');
   await act(async()=>{alpha.getState().chooseMode('competitive');alpha.getState().chooseTeamSize(3);ui.setState({screen:'main',overlay:null});ui.getState().setActiveMenuIndex(MAIN_MENU_ITEMS.findIndex(item=>item.id==='explore'));ui.getState().activateActiveMenuSelection();});await render(ModeSelection);
   assert.equal(alpha.getState().mode,'sandbox');assert.equal(document.querySelector('h1').textContent,'EXPLORE & BUILD');assert.equal(document.querySelector('[data-play-category]').dataset.playCategory,'tools');assert.equal(document.querySelectorAll('[data-match-size]').length,0);assert.deepEqual([...document.querySelectorAll('.alpha-mode-tabs [role=tab]')].map(tab=>tab.textContent),['SANDBOX','WORLD EDITOR','SIGNAL RECON','SWARM COMMANDPLANNED']);
   await act(async()=>alpha.getState().restoreMode('sandbox',1));assert.equal(alpha.getState().teamSize,3,'a one-player practice admission preserves the match format preference');
   await act(async()=>route('next_tab'));assert.equal(alpha.getState().mode,'editor');assert(document.querySelector('[data-mode-config]'));
   await act(async()=>route('next_tab'));assert.equal(alpha.getState().mode,'signal_recon');assert(document.querySelector('[data-can-field]'));
   await act(async()=>route('next_tab'));assert.equal(alpha.getState().mode,'swarm');assert(document.querySelector('.alpha-selection-footer button[disabled]'));
   await act(async()=>{ui.setState({screen:'main',overlay:null});ui.getState().setActiveMenuIndex(MAIN_MENU_ITEMS.findIndex(item=>item.id==='play'));ui.getState().activateActiveMenuSelection();});await render(ModeSelection);
   assert.equal(alpha.getState().mode,'competitive');assert.equal(alpha.getState().teamSize,3);assert.equal(document.querySelector('[data-play-category]').dataset.playCategory,'match');assert.equal(document.querySelectorAll('.alpha-mode-tabs [role=tab]').length,2);
  });
  await t.test('queue admission restores the authoritative category and size before hero selection',async()=>{
   const {useAlphaFlow}=await load('game/alpha/useAlphaFlow.ts'),{QueueScreen}=await load('game/alpha/QueueScreen.tsx');
   function FlowQueue(){useAlphaFlow();return h(QueueScreen);}
   const queue={mode:'competitive',team_size:3,capacity:6,position:2,size:3,joined:1,reason:'Capacity reserved'};
   await act(async()=>{alpha.setState({mode:'quickplay',teamSize:5});social.setState({view:{...view,alpha:{...view.alpha,queue}}});ui.setState({screen:'queue',overlay:null});});await render(FlowQueue);
   assert.equal(alpha.getState().mode,'competitive');assert.equal(alpha.getState().teamSize,3);assert.match(document.querySelector('.alpha-queue-card h2').textContent,/COMPETITIVE · 3V3/);assert(!document.querySelector('.alpha-queue-note').textContent.includes('ONE 3V3'));
   await act(async()=>social.setState({view:{...view,alpha:{...view.alpha,queue:null,active:{...active,mode:'competitive',hero:'tank'}}}}));assert.equal(ui.getState().screen,'hero_select');assert.equal(alpha.getState().mode,'competitive');assert.equal(alpha.getState().teamSize,3);assert.equal(alpha.getState().hero,'tank');
  });
  await t.test('queued ACK discards an obsolete seat or ticket until a fresh social view arrives',async()=>{
   const {joinSelectedMode}=await load('game/alpha/sessionActions.ts'),{useAlphaFlow}=await load('game/alpha/useAlphaFlow.ts');
   function FlowOnly(){useAlphaFlow();return null;}
   for(const previous of [{active:{...active,mode:'quickplay',team_size:5},queue:null},{active:null,queue:{mode:'quickplay',team_size:5,position:1,size:2,joined:1,reason:'Old queue'}}]){
    await act(async()=>{alpha.getState().chooseMode('competitive');alpha.getState().chooseTeamSize(3);social.setState({view:{...view,alpha:{...view.alpha,...previous}}});ui.setState({screen:'mode_select',overlay:null});});await render(FlowOnly);
    let joining;await act(async()=>{joining=joinSelectedMode();});const request=sent.at(-1);
    await act(async()=>client.receiveSocialResult({request_id:request.request_id,ok:true,data:{status:'queued',mode:'competitive',team_size:3}}));await joining;
    assert.equal(ui.getState().screen,'queue','an ACK cannot reopen the old Hero selection');assert.equal(social.getState().view.alpha.active,null);assert.equal(social.getState().view.alpha.queue,null,'no guessed ticket is manufactured');assert.equal(alpha.getState().mode,'competitive');assert.equal(alpha.getState().teamSize,3);
   }
   await act(async()=>social.setState({view:{...view,alpha:{...view.alpha,active:{...active,mode:'competitive',world_id:8},queue:null}}}));assert.equal(ui.getState().screen,'hero_select');assert.equal(alpha.getState().teamSize,3);
  });
  await t.test('failed queue requests preserve cached authority and an early new-world promotion is retained',async()=>{
   const {joinSelectedMode}=await load('game/alpha/sessionActions.ts'),{useAlphaFlow}=await load('game/alpha/useAlphaFlow.ts');
   function FlowOnly(){useAlphaFlow();return null;}
   const previous={...view,alpha:{...view.alpha,active:{...active,mode:'quickplay',team_size:5},queue:null}};
   await act(async()=>{alpha.getState().chooseMode('competitive');alpha.getState().chooseTeamSize(3);social.setState({view:previous});ui.setState({screen:'mode_select',overlay:null});});await render(FlowOnly);
   let joining;await act(async()=>{joining=joinSelectedMode().then(()=>null,error=>error);});await act(async()=>client.receiveSocialResult({request_id:sent.at(-1).request_id,ok:false,message:'Server busy'}));assert.match((await joining).message,/Server busy/);assert.equal(social.getState().view,previous);assert.equal(ui.getState().screen,'mode_select');
   await act(async()=>{joining=joinSelectedMode();});const request=sent.at(-1),promoted={...view,alpha:{...view.alpha,active:{...active,mode:'competitive',world_id:9},queue:null}};
   await act(async()=>social.setState({view:promoted}));await act(async()=>client.receiveSocialResult({request_id:request.request_id,ok:true,data:{status:'queued',mode:'competitive',team_size:3}}));await joining;
   assert.equal(social.getState().view.alpha.active.world_id,9,'do not erase a newer compatible promotion');assert.equal(ui.getState().screen,'hero_select');assert.equal(alpha.getState().mode,'competitive');assert.equal(alpha.getState().teamSize,3);
  });
  await t.test('an ambiguous early promotion reusing the old world requests a fresh authoritative view',async()=>{
   const {joinSelectedMode}=await load('game/alpha/sessionActions.ts'),{useAlphaFlow}=await load('game/alpha/useAlphaFlow.ts');
   function FlowOnly(){useAlphaFlow();return null;}
   const previous={...view,alpha:{...view.alpha,active:{...active,mode:'quickplay',hero:'tank'},queue:null}};
   await act(async()=>{alpha.getState().chooseMode('quickplay');alpha.getState().chooseTeamSize(3);social.setState({view:previous});ui.setState({screen:'mode_select',overlay:null});});await render(FlowOnly);
   let joining;await act(async()=>{joining=joinSelectedMode();});const request=sent.at(-1),reused={...view,alpha:{...view.alpha,active:{...active,mode:'quickplay'},queue:null}};
   await act(async()=>social.setState({view:reused}));await act(async()=>client.receiveSocialResult({request_id:request.request_id,ok:true,data:{status:'queued',mode:'quickplay',team_size:3}}));await joining;
   assert.equal(sent.at(-1).action,'refresh');assert.equal(ui.getState().screen,'queue');assert.equal(social.getState().view.alpha.active,null,'an ambiguous cached seat cannot trigger deployment');
   await act(async()=>client.receiveSocialResult({request_id:sent.at(-1).request_id,ok:true,data:{}}));assert.equal(ui.getState().screen,'queue');
   await act(async()=>social.setState({view:reused}));assert.equal(ui.getState().screen,'hero_select');assert.equal(alpha.getState().teamSize,3);
  });
  await t.test('3v3 role capacity reserves one place for each role and excludes your replaceable pick',async()=>{
   const {unavailableHeroes}=await load('game/alpha/heroAvailability.ts');
   const roster=[{id:'me',team:'red',hero:'tank',mode:'skirmish',world_id:4},{id:'dps',team:'red',hero:'brz',mode:'skirmish',world_id:4},{id:'enemy',team:'blue',hero:'mechanic',mode:'skirmish',world_id:4}];
   const limits=unavailableHeroes({...view.alpha,active,roster},'skirmish','me');assert.equal(limits.tank,undefined);assert.match(limits.brz,/DPS full/);assert.equal(limits.mechanic,undefined);assert.deepEqual(unavailableHeroes({...view.alpha,role_limits:false,active,roster},'skirmish','me'),{});
   const filled=[...roster,{id:'tank2',team:'red',hero:'tank',mode:'skirmish',world_id:4}];assert.match(unavailableHeroes({...view.alpha,active,roster:filled},'skirmish','me').tank,/TANK full/);
   const modern={...active,mode:'competitive',role_caps:undefined,role_minimums:undefined},modernRoster=roster.map(member=>({...member,mode:'competitive'}));assert.match(unavailableHeroes({...view.alpha,active:modern,roster:modernRoster},'competitive','me').brz,/DPS full/,'fallback roles follow confirmed size rather than queue category');
  });
  await t.test('own-team deployment preview uses three slots while Quickplay retains five',async()=>{
   const {PreMatchTeamPreview}=await load('game/stats/PreMatchTeamPreview.tsx');
   const own=[{id:'me',name:'Driver',team:'red',hero:'tank',mode:'skirmish',world_id:4,reconnecting:false},{id:'ally',name:'Ally',team:'red',hero:'mechanic',mode:'skirmish',world_id:4,reconnecting:false},{id:'enemy',name:'Enemy',team:'blue',hero:'brz',mode:'skirmish',world_id:4,reconnecting:false}];
   await act(async()=>root.render(h(PreMatchTeamPreview,{view:{...view,alpha:{...view.alpha,active,roster:own}}})));assert.equal(document.querySelectorAll('.match-composition-seat').length,3);assert.equal(document.querySelectorAll('.match-composition-empty').length,1);assert(!document.querySelector('.match-team-composition').textContent.includes('Enemy'));
   await act(async()=>root.render(h(PreMatchTeamPreview,{view:{...view,alpha:{...view.alpha,active:{...active,mode:'quickplay',team_size:5},roster:[]}}})));assert.equal(document.querySelectorAll('.match-composition-seat').length,5);
  });
  await t.test('career and team staging recognize the distinct casual mode',async()=>{
   const {CAREER_MODES,careerModeLabel}=await load('game/career/careerData.ts'),{garageTeamAccent,TEAM_GARAGE_LIGHT_COLORS}=await load('game/preview/garageTeamAccent.ts');assert(CAREER_MODES.some(([id])=>id==='skirmish'));assert.equal(careerModeLabel('skirmish'),'3v3 CTF');assert.equal(garageTeamAccent('hero_select',active),TEAM_GARAGE_LIGHT_COLORS.red);assert.equal(garageTeamAccent('sandbox',active),null);
  });
 }finally{await act(async()=>root.unmount());await vite.close();dom.window.close();for(const[key,value]of original){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
