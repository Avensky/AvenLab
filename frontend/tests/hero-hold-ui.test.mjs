import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {createServer} from 'vite';import {createElement as h,act} from 'react';import {createRoot} from 'react-dom/client';
test('shared portrait selection opens settings; only a complete X hold sets main via keyboard, pointer or gamepad',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),original=new Map();let root,server,clock=0,id=0;const frames=new Map(),requests=[];
 const pad={index:2,id:'Xbox',connected:true,axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
 for(const [k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,HTMLSelectElement:dom.window.HTMLSelectElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:cb=>{frames.set(++id,cb);return id;},cancelAnimationFrame:k=>frames.delete(k)})){original.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});}
 const oldNow=Object.getOwnPropertyDescriptor(performance,'now');Object.defineProperty(performance,'now',{value:()=>clock,configurable:true});Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.hasFocus=()=>true;navigator.getGamepads=()=>[null,null,pad];window.requestAnimationFrame=requestAnimationFrame;window.cancelAnimationFrame=cancelAnimationFrame;window.HTMLElement.prototype.scrollIntoView=()=>{};
 const advance=ms=>act(async()=>{clock+=ms;for(const k of [...frames.keys()]){const cb=frames.get(k);if(cb){frames.delete(k);cb(clock);}}});
 const key=(code,type='keydown')=>act(async()=>window.dispatchEvent(new window.KeyboardEvent(type,{code,bubbles:true})));
 const pointer=(el,type)=>act(async()=>{const e=new window.MouseEvent(type,{button:0,bubbles:true});Object.defineProperty(e,'pointerId',{value:7});el.dispatchEvent(e);});
 const settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,360));});
 try{
  server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});const load=p=>server.ssrLoadModule('/src/'+p);
  const client=await load('net/socialClient.ts');
  client.setSocialConnection({readyState:1,send:body=>{
   const request=JSON.parse(body);requests.push(request);
   queueMicrotask(()=>client.receiveSocialResult({request_id:request.request_id,ok:true,data:{}}));
  }});
  const {useSocialStore}=await load('store/social/socialStore.ts');useSocialStore.setState({view:{profile:{id:'alice',name:'Alice',progression:{default_hero:'brz',hero_loadouts:{},owned:['factory'],tier:'BRONZE',prestige:0,level:1,xp:0,required_xp:100,credits:0}},alpha:{skins:[]}}});
  const {useHeroLoadouts:cache}=await load('vehicles/cosmetics/heroLoadouts.ts');cache.getState().adopt('alice','brz');const {useUIStore:ui}=await load('store/menus/uiStore.ts');ui.setState({screen:'heroes',overlay:null,isModeLoading:false});
  const {HeroWorkshop}=await load('game/heroes/HeroWorkshop.tsx'),{GameController}=await load('controls/GameController.ts');root=createRoot(document.getElementById('root'));await act(async()=>root.render(h('div',null,h(GameController),h(HeroWorkshop))));
  assert.equal(document.querySelector('.vehicle-studio'),null);assert.equal(document.querySelectorAll('.hero-portrait-card').length,(await load('store/alpha/alphaStore.ts')).HEROES.length);assert.equal(document.querySelector('.hero-portrait-card[aria-pressed="true"]').dataset.hero,'brz');assert.equal(document.querySelectorAll('.hero-collection-tile').length,0);
  await advance(0);pad.buttons[2].pressed=true;await advance(16);await advance(1300);pad.buttons[2].pressed=false;await advance(16);assert.equal(requests.length,0);
  await act(async()=>document.querySelector('[data-hero="camaro"]').click());assert(document.querySelector('.vehicle-studio'));assert.equal(requests.length,0);
  const chooseTab=async id=>act(async()=>document.getElementById(`vehicle-studio-tab-${id}`).click());
  const panel=document.querySelector('.vehicle-studio-panel');
  const content=panel.querySelector('.vehicle-studio-panel-content');
  const toggle=panel.querySelector('.vehicle-studio-panel-toggle');
  const progress=panel.querySelector('[aria-label="Installed upgrade stages"]');
  assert.equal(document.querySelector('.menu-frame-header h1').textContent,'CUSTOMIZE');
  assert.equal(content.hidden,false,'the upgrade controls open with Customize');
  assert.equal(progress.getAttribute('aria-valuenow'),'0');
  await act(async()=>panel.querySelector('[aria-label="Upgrade Turbo kit"]').click());
  assert.equal(progress.getAttribute('aria-valuenow'),'1');
  assert.deepEqual([...panel.querySelectorAll('[aria-label="Turbo kit stage"] i')].map(bar=>bar.style.getPropertyValue('--bar-fill')),['100%','0%','0%']);
  await act(async()=>toggle.click());
  assert.equal(toggle.getAttribute('aria-expanded'),'false');
  assert.equal(content.hidden,true);
  assert.equal(progress.getAttribute('aria-valuenow'),'1');
  for(const [tab,label] of [['paint','appearance'],['body','body'],['lighting','lighting'],['studio','portrait']]){
   await chooseTab(tab);
   assert.equal(content.hidden,false);
   await act(async()=>toggle.click());
   assert.equal(toggle.getAttribute('aria-label'),`Expand ${label}`);
   assert.equal(content.hidden,true);
   await act(async()=>toggle.click());
   assert.equal(content.hidden,false);
  }
  await chooseTab('performance');
  assert.equal(content.hidden,true,'each panel remembers its own collapse state');
  await act(async()=>toggle.click());
  assert.equal(content.hidden,false);
  const {usePreferencesStore:prefs}=await load('store/preferences/preferencesStore.ts');
  await act(async()=>prefs.getState().update({inputDevice:'keyboard'}));
  let b=document.querySelector('.hero-main-hold');assert(b.querySelector(':scope > .keyboard-key[data-keyboard-key=X]'));assert.equal(b.querySelector('.hero-main-orbit'),null);await pointer(b,'pointerdown');await advance(500);assert(Number(b.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'))>0);await pointer(b,'pointerup');await advance(1500);assert.equal(requests.length,0);
  await key('KeyX');await advance(1100);await key('KeyX','keyup');await advance(200);assert.equal(requests.length,0);
  await act(async()=>document.querySelector('.alpha-selection-footer button[aria-label=Back]').click());assert.equal(document.querySelector('.vehicle-studio'),null);assert.equal(document.querySelectorAll('.hero-workshop-actions .controller-action').length,2);
  await key('KeyX');await advance(1250);await settle();assert.equal(requests.filter(r=>r.make_default).length,1);assert.equal(cache.getState().defaultHero,'camaro');assert.equal(document.querySelector('.hero-main-hold').dataset.main,'true');await advance(2000);assert.equal(requests.filter(r=>r.make_default).length,1);await key('KeyX','keyup');
  await act(async()=>document.querySelector('[data-hero="camaro"]').click());assert.equal(document.querySelectorAll('.hero-workshop-actions .controller-action').length,2);
  await chooseTab('paint');
  await act(async()=>document.querySelector('[aria-label="Paint: Crimson red"]').click());await settle();assert.equal(requests.at(-1).make_default,false);assert.equal(cache.getState().defaultHero,'camaro');
  await act(async()=>document.querySelector('.alpha-selection-footer button[aria-label=Back]').click());assert.equal(document.querySelector(".vehicle-studio"),null);await act(async()=>document.querySelector('[data-hero="brz"]').click());await key('KeyX');await advance(900);await act(async()=>window.dispatchEvent(new window.Event('blur')));await advance(500);assert.equal(cache.getState().defaultHero,'camaro');await key('KeyX','keyup');await act(async()=>window.dispatchEvent(new window.Event('focus')));await advance(0);
  await act(async()=>prefs.getState().update({inputDevice:'controller'}));
  assert(document.querySelector('.hero-main-orbit [data-controller-key=X]'));
  pad.buttons[2].pressed=true;await advance(16);await advance(600);pad.buttons[2].pressed=false;await advance(16);await advance(1000);assert.equal(cache.getState().defaultHero,'camaro');
  pad.buttons[2].pressed=true;await advance(16);await advance(1250);await settle();assert.equal(cache.getState().defaultHero,'brz');pad.buttons[2].pressed=false;await advance(16);
 }finally{if(root)await act(async()=>root.unmount());await server?.close();dom.window.close();if(oldNow)Object.defineProperty(performance,'now',oldNow);else delete performance.now;for(const [k,v]of original)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}
});
