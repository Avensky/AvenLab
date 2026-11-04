import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';

test('hero guide explains shipped actions and returns without equipping or replacing the world',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true}),original=new Map();
 for(const[k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,HTMLSelectElement:dom.window.HTMLSelectElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,requestAnimationFrame:fn=>{fn(performance.now());return 1;},cancelAnimationFrame:()=>{},IS_REACT_ACT_ENVIRONMENT:true})){
  original.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});
 }
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};dom.window.HTMLElement.prototype.scrollTo=()=>{};dom.window.HTMLElement.prototype.scrollBy=()=>{};
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}}),load=p=>vite.ssrLoadModule('/src/'+p),root=createRoot(document.getElementById('root'));
 try{
  const {HEROES,useAlphaStore:alpha}=await load('store/alpha/alphaStore.ts'),{getHeroAbilityGuide:guide,HERO_EFFECT_GUIDE:effects}=await load('game/heroes/heroAbilityCatalog.ts');
  const {useUIStore:ui}=await load('store/menus/uiStore.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts'),{useNetworkStore:network}=await load('store/session/networkStore.ts');
  const {useHeroLoadouts:loadouts,FACTORY_APPEARANCE:factory}=await load('vehicles/cosmetics/heroLoadouts.ts'),{openHeroGuide:open,closeHeroGuide:close,useHeroGuideStore:state}=await load('store/hud/heroGuideStore.ts');
  const client=await load('net/socialClient.ts'),sent=[];client.setSocialConnection({readyState:WebSocket.OPEN,send:body=>sent.push(JSON.parse(body))});
  const {HeroWorkshop}=await load('game/heroes/HeroWorkshop.tsx'),{HeroAbilities}=await load('game/heroes/HeroAbilities.tsx'),{routeMenuAction:route}=await load('controls/inputRouting.ts');
  function Host(){const screen=ui(s=>s.screen),overlay=ui(s=>s.overlay);return h('div',null,screen==='heroes'&&h(HeroWorkshop),overlay==='hero_abilities'&&h(HeroAbilities));}
  const click=async selector=>{const node=document.querySelector(selector);assert(node,selector);await act(async()=>node.click());};
  await t.test('every hero has three ability slots; every chassis has a live barrage and a shield',()=>{
   const rust=fs.readFileSync('../avenlab-server/src/vehicle_health.rs','utf8'),number=name=>Number(rust.match(new RegExp('pub const '+name+': f32 = ([0-9.]+)'))[1]);
   for(const hero of HEROES){const data=guide(hero.id);assert.equal(data.abilities.length,3);assert.equal(data.ultimate.state,'live');assert.equal(data.ultimate.name,'BARRAGE');assert(data.abilities.some(a=>a.state==='live'&&['barrier','guard-boost','dive-shield'].includes(a.id)));}
   const tank=guide('tank');assert.deepEqual(tank.abilities.map(ability=>ability.id),['ram','barrier','scope']);assert.equal(tank.abilities[1].state,'live');assert(tank.abilities[1].stats.some(stat=>stat.value==='500 HP · 10 m wide'));assert.match(tank.abilities[2].notes,/Angle Lock/);assert.equal(tank.weapons.length,3);assert(tank.weapons.every(weapon=>weapon.state==='live'));assert.equal(tank.weapons.find(weapon=>weapon.id==='roof-mg').stats.find(stat=>stat.label==='Range').value,'800 m');assert.equal(tank.weapons.find(weapon=>weapon.id!=='roof-mg'&&weapon.id!=='cannon').stats.find(stat=>stat.label==='Range').value,'200 m');assert.equal(tank.weapons[0].stats.find(s=>s.label==='Direct hit').value,number('CANNON_DAMAGE')+' HP');assert.equal(tank.weapons[1].stats.find(s=>s.label==='Per hit').value,number('COAX_DAMAGE')+' HP');assert(tank.abilities[0].stats.some(s=>s.value===number('RAM_DAMAGE')+' HP + 1 s stun'));
   assert.equal(guide('mini').role,'DPS');assert.equal(guide('mini').weapons.length,1);assert.equal(guide('mechanic').weapons[0].id,'health-pack');assert.equal(guide('mechanic').abilities[0].id,'revive');assert.equal(new Set(HEROES.map(h=>h.vehicle)).size,HEROES.length);assert.equal(guide('cx30').weapons[0].id,'support-spray');assert.equal(guide('cx30').abilities[0].id,'dive-shield');assert.equal(guide('brz').weapons.length,1);assert.equal(guide('brz').abilities[0].id,'guard-boost');assert.equal(guide('brz').abilities[0].state,'live');
  });
  await t.test('status reference reuses live buff/debuff descriptions with unique timed and untimed states',()=>{
   const map=new Map(effects.map(effect=>[effect.id,effect]));assert.equal(map.size,effects.length);assert.equal(map.get('spawn-protection').duration,2);assert.equal(map.get('stun').duration,1);assert.equal(map.get('ram-charge').duration,3);assert.equal(map.get('ram-boost').duration,4);assert.equal(map.get('thermal-recovery').duration,null);assert.match(map.get('thermal-recovery').description,/drive to repairs/);assert.equal(map.get('engine-wear').kind,'debuff');assert.equal(map.get('tank-barrier').duration,null);assert.equal(map.get('dive-shield').duration,2);assert.equal(map.get('tank-barrier').nature,'defense');
  });
  await t.test('Heroes starts with an empty collection preview and Y toggles help without choosing a main',async()=>{
   social.setState({view:{profile:{id:'me',name:'Player',progression:{default_hero:'brz',hero_loadouts:{brz:factory},owned:['factory'],tier:'BRONZE',color:'#aabbcc',prestige:0,level:1,xp:0,required_xp:100,credits:0}},alpha:{skins:[]}}});
   loadouts.getState().adopt('me','brz',{brz:{...factory}});alpha.getState().preview('tank');ui.setState({screen:'heroes',overlay:null,isModeLoading:false});
   await act(async()=>root.render(h(Host)));
   assert.equal(alpha.getState().previewHero,null);assert.equal(loadouts.getState().defaultHero,'brz');assert.equal(document.querySelector('.hero-modifications'),null);
   assert.equal(document.querySelectorAll('.hero-portrait-card[aria-pressed="true"]').length,0);assert.equal(document.querySelector('.hero-main-hold').disabled,true);
   assert(document.querySelector('[data-open-hero-abilities] [data-controller-key="Y"]'));
   await act(async()=>route('activate'));assert(document.activeElement.matches('[data-hero]'),'A first focuses a portrait instead of selecting the saved main');assert.equal(alpha.getState().previewHero,null);
   const first=document.activeElement.dataset.hero;await act(async()=>route('next_tab'));assert.notEqual(document.activeElement.dataset.hero,first);await act(async()=>route('previous_tab'));assert.equal(document.activeElement.dataset.hero,first);assert.equal(alpha.getState().previewHero,null,'tab browsing focuses portraits without choosing a preview');
   document.querySelector('.hero-workshop').focus();
   await act(async()=>window.dispatchEvent(new dom.window.Event('avenlab:hero-abilities')));
   assert.equal(ui.getState().overlay,'hero_abilities');assert(document.querySelector('.hero-ability-guide').classList.contains('hero-selection'),'guide participates in the shared Play theme/frame');assert(document.querySelector('[data-close-hero-abilities] [data-controller-key="Y"]'));
   await act(async()=>window.dispatchEvent(new dom.window.Event('avenlab:hero-abilities')));
   assert.equal(ui.getState().overlay,null);assert.equal(alpha.getState().previewHero,null,'closing help restores the empty selection stage');assert.equal(loadouts.getState().defaultHero,'brz');assert.equal(sent.length,0);
   await act(async()=>root.render(null));
  });
  await t.test('the styling view survives opening, browsing and controller Back without changing main or saved cosmetics',async()=>{
   social.setState({view:{profile:{id:'me',name:'Player',progression:{default_hero:'brz',hero_loadouts:{brz:factory},owned:['factory'],tier:'BRONZE',color:'#aabbcc',prestige:0,level:1,xp:0,required_xp:100,credits:0}},alpha:{skins:[]}}});loadouts.getState().adopt('me','brz',{brz:{...factory}});alpha.getState().preview('brz');ui.setState({screen:'heroes',overlay:null,isModeLoading:false});
   await act(async()=>root.render(h(Host)));await click('[data-hero="brz"]');const styling=document.querySelector('.hero-modifications');assert(styling);const before=JSON.stringify(loadouts.getState().loadouts);
   await click('[data-open-hero-abilities]');assert.equal(ui.getState().overlay,'hero_abilities');assert(document.querySelector('.hero-workshop').hasAttribute('inert'));assert.equal(state.getState().selectedHero,'brz');assert(document.querySelector('.hero-main-hold').disabled,'main hold cannot run beneath help');
   await click('[data-guide-hero="tank"]');assert.equal(state.getState().selectedHero,'tank');assert.equal(alpha.getState().previewHero,'tank');assert.equal(document.querySelectorAll('.hero-ability-grid article').length,4);assert.equal(document.querySelector('.hero-ability-grid article:last-child').dataset.planned,'false');
   assert.equal(loadouts.getState().defaultHero,'brz');assert.equal(JSON.stringify(loadouts.getState().loadouts),before);assert.equal(sent.length,0,'help does not save a loadout or spawn a vehicle');
   let escaped=0;const lateUnderlying=()=>{if(ui.getState().overlay===null){escaped++;ui.setState({screen:'main'});}};window.addEventListener('avenlab:panel-action',lateUnderlying);
   try{await act(async()=>route('back'));}finally{window.removeEventListener('avenlab:panel-action',lateUnderlying);}assert.equal(escaped,0,'Back is consumed before later underlay listeners can navigate');assert.equal(ui.getState().overlay,null);assert.equal(ui.getState().screen,'heroes');assert.equal(alpha.getState().previewHero,'brz');assert.equal(document.querySelector('.hero-modifications'),styling,'same styling component remains mounted');
  });
  await t.test('world guide uses the active hero and portrait preview without touching physics, selection or return overlay',async()=>{
   const entity={id:'me',kind:'vehicle',vehicle_id:'tank',room_id:4,team:'red',position:[9,2,17],rotation:[0,0,0,1]};network.setState({connected:true,playerId:'me'});network.getState().setSnapshot({tick:7,entities:[entity]},performance.now());social.setState({view:{...social.getState().view,alpha:{active:{hero:'tank'}}}});ui.setState({screen:'sandbox',overlay:'pause'});
   const snapshot=network.getState().snapshot,preview=alpha.getState().previewHero;await act(async()=>open());assert.equal(state.getState().selectedHero,'tank');assert.equal(ui.getState().screen,'sandbox');
   await act(async()=>route('next_tab'));assert.equal(state.getState().selectedHero,'ae86');assert.equal(alpha.getState().previewHero,preview);assert.equal(network.getState().snapshot,snapshot);assert.equal(network.getState().getMe().vehicle_id,'tank');assert.equal(sent.length,0);
   await act(async()=>close());assert.equal(ui.getState().overlay,'pause');assert.equal(ui.getState().screen,'sandbox');assert.equal(network.getState().snapshot,snapshot);
  });
  await t.test('planned vehicles and kits never enter the playable roster or main-hero selection',async()=>{
   const {HERO_CONCEPTS:vehicles,HERO_KIT_CONCEPTS:kits}=await load('game/heroes/heroConceptCatalog.ts');
   assert.equal(vehicles.length,3);assert.equal(kits.length,3);const concepts=[...vehicles,...kits];assert.equal(new Set(concepts.map(item=>item.id)).size,concepts.length);
   const before={hero:alpha.getState().hero,preview:alpha.getState().previewHero,selected:state.getState().selectedHero,main:loadouts.getState().defaultHero,sent:sent.length};
   for(const item of concepts){assert.equal(item.state,'planned');assert(!HEROES.some(hero=>hero.id===item.id));alpha.getState().chooseHero(item.id);state.getState().chooseHero(item.id);}
   assert.deepEqual({hero:alpha.getState().hero,preview:alpha.getState().previewHero,selected:state.getState().selectedHero,main:loadouts.getState().defaultHero,sent:sent.length},before);
   assert.equal(vehicles.some(item=>item.shape==='suv'),false);assert.equal(guide('cx30').weapons[0].id,'support-spray');assert.match(kits.find(item=>item.id==='concept-interceptor').summary,/spray cone/);assert(vehicles.some(item=>item.shape==='submarine'&&item.tentative));assert(vehicles.some(item=>item.shape==='motorcycle'&&item.tentative));
  });
  await t.test('read-only concepts browse by controller without changing the live vehicle, main or cosmetics',async()=>{
   ui.setState({screen:'sandbox',overlay:'pause'});await act(async()=>open('tank'));
   const before={snapshot:network.getState().snapshot,hero:alpha.getState().hero,preview:alpha.getState().previewHero,main:loadouts.getState().defaultHero,styles:JSON.stringify(loadouts.getState().loadouts),sent:sent.length};
   await click('[data-guide-concepts]');const gallery=document.querySelector('[aria-label="Planned hero concepts"]');assert(gallery);assert.equal(gallery.querySelectorAll('[data-vehicle-concept]').length,3);assert.equal(gallery.querySelectorAll('[data-kit-concept]').length,3);assert.equal(gallery.querySelectorAll('button,input,select,[data-hero]').length,0,'reference cards have no equip, unlock or deployment controls');assert.match(gallery.textContent,/NEEDS ASSET & PHYSICS/);assert.match(gallery.textContent,/PLANNED/);
   assert.equal(document.querySelectorAll('[data-guide-hero][aria-pressed="true"]').length,0);assert.equal(state.getState().selectedHero,'tank');
   await act(async()=>route('previous_tab'));assert.equal(state.getState().selectedHero,HEROES.at(-1).id);assert.equal(document.querySelector('.hero-concept-gallery'),null);
   await act(async()=>route('next_tab'));assert(document.querySelector('.hero-concept-gallery'));await act(async()=>route('next_tab'));assert.equal(state.getState().selectedHero,'tank');assert.equal(document.querySelector('.hero-concept-gallery'),null);
   assert.equal(network.getState().snapshot,before.snapshot);assert.equal(alpha.getState().hero,before.hero);assert.equal(alpha.getState().previewHero,before.preview);assert.equal(loadouts.getState().defaultHero,before.main);assert.equal(JSON.stringify(loadouts.getState().loadouts),before.styles);assert.equal(sent.length,before.sent);
   await act(async()=>route('back'));assert.equal(ui.getState().overlay,'pause');
  });
  await t.test('Escape returns from help and invalid hero IDs cannot alter the chosen guide',async()=>{
   ui.setState({overlay:null});await act(async()=>open('tank'));await act(async()=>state.getState().chooseHero('unknown'));assert.equal(state.getState().selectedHero,'tank');
   await act(async()=>document.querySelector('.hero-ability-guide').dispatchEvent(new dom.window.KeyboardEvent('keydown',{code:'Escape',bubbles:true,cancelable:true})));assert.equal(ui.getState().overlay,null);assert.equal(document.querySelector('.hero-ability-guide'),null);
  });
 }finally{await act(async()=>root.unmount());await vite.close();dom.window.close();for(const[k,v]of original){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
});
