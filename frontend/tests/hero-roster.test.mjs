import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'vite';import {JSDOM} from 'jsdom';import {createElement as h,act} from 'react';import {createRoot} from 'react-dom/client';
test('Hero cards separate navigation, selection, team capacity and personal styles',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map();let root;
 for(const [k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'}),load=p=>vite.ssrLoadModule('/src/'+p);
 try{
  const {unavailableHeroes:locked}=await load('game/alpha/heroAvailability.ts'),active={mode:'quickplay',world_id:7,hero:'brz',team:'red'};
  const member=(id,hero,extra={})=>({id,name:id,hero,mode:'quickplay',team:'red',world_id:7,reconnecting:false,...extra});
  await t.test('full roles block picks; replacing our own pick does not double-count it',()=>{
   const state={active,role_limits:true,roster:[member('me','brz'),member('t','tank'),member('d1','ae86'),member('d2','supra'),member('s','cx30')]};assert(locked(state,'quickplay','me').tank);assert(!locked(state,'quickplay','me').camaro);
   assert(!locked({...state,roster:[member('me','tank'),member('d1','ae86'),member('d2','supra'),member('s','cx30')]},'quickplay','me').tank);
   assert(locked({...state,roster:[member('me',''),member('d1','ae86'),member('d2','supra'),member('d3','camaro')]},'quickplay','me').brz);
   const no=locked({...state,roster:[member('me',''),member('s1','cx30'),member('s2','cx30')]},'quickplay','me');assert(no.cx30);
  });
  await t.test('required seats and reconnects count; other teams/worlds and flex do not',()=>{
   const state={active,role_limits:true,roster:[member('me',''),member('d1','brz'),member('d2','ae86'),member('s1','cx30'),member('s2','cx30',{reconnecting:true}),member('other','tank',{team:'blue'}),member('elsewhere','tank',{world_id:8})]};const no=locked(state,'quickplay','me');assert(no.supra);assert(!no.tank);assert.deepEqual(locked({...state,role_limits:false},'quickplay','me'),{});assert.deepEqual(locked(state,'sandbox','me'),{});assert.deepEqual(locked(undefined,'quickplay','me'),{});
  });
  const {HeroRoster}=await load('game/alpha/HeroRoster.tsx'),{HeroPortrait}=await load('game/alpha/HeroPortrait.tsx'),{useHeroLoadouts:cache,FACTORY_APPEARANCE:factory}=await load('vehicles/cosmetics/heroLoadouts.ts');root=createRoot(document.getElementById('root'));const chosen=[],render=c=>act(async()=>root.render(c));
  await t.test('hover/focus never choose, click chooses, full cards cannot activate',async()=>{
   await render(h(HeroRoster,{selected:'brz',filter:'all',busy:false,onChoose:id=>chosen.push(id),onFilter:()=>{},unavailable:{tank:'TANK full'}}));assert.equal(document.querySelectorAll('.hero-roster-vacancy').length,0);assert.equal(document.querySelectorAll('[data-hero=mechanic],[data-hero=logistics]').length,2);const card=document.querySelector('[data-hero="camaro"]');await act(async()=>{card.dispatchEvent(new window.MouseEvent('pointerover',{bubbles:true}));card.focus();});assert.deepEqual(chosen,[]);assert.equal(document.querySelector('[aria-pressed="true"]').dataset.hero,'brz');await act(async()=>card.click());assert.deepEqual(chosen,['camaro']);const tank=document.querySelector('[data-hero="tank"]');assert(tank.disabled);assert.equal(tank.dataset.unavailable,'true');await act(async()=>tank.click());assert.deepEqual(chosen,['camaro']);
  });
  await t.test('own portraits use saved/draft styles; peers never borrow ours; account switch clears',async()=>{
   await act(async()=>cache.getState().adopt('alice','brz',{brz:{...factory,body:'#ed258d'}}));await render(h('div',null,h(HeroPortrait,{hero:'brz',className:'own'}),h(HeroPortrait,{hero:'brz',className:'peer',appearance:{...factory,body:'#f4f5f7'}}),h(HeroPortrait,{hero:'brz',className:'unknown',appearance:null})));assert.equal(document.querySelector('.own').style.getPropertyValue('--portrait-paint'),'#ed258d');assert.equal(document.querySelector('.peer').style.getPropertyValue('--portrait-paint'),'#f4f5f7');assert.equal(document.querySelector('.unknown').dataset.style,'factory');await act(async()=>cache.setState({draft:{vehicle:'brz',appearance:{...factory,body:'#161a22'}}}));assert.equal(document.querySelector('.own').style.getPropertyValue('--portrait-paint'),'#161a22');await act(async()=>cache.getState().adopt('bob'));assert.equal(document.querySelector('.own').dataset.style,'factory');
  });
  const {createPortraitCache,portraitStyleKey}=await load('game/alpha/heroPortraitCache.ts');
  await t.test('image jobs deduplicate, serialize, separate styles and recover from failure',async()=>{
   let calls=0,active=0,max=0;const get=createPortraitCache(async(model,style)=>{calls++;max=Math.max(max,++active);await new Promise(r=>setTimeout(r,5));active--;if(style.skin==='fail')throw Error('missing');return model+style.body;},2);const a=get('brz',factory),b=get('brz',{...factory});assert.equal(a,b);const c=get('brz',{...factory,body:'#ed258d'});assert.notEqual(a,c);await Promise.all([a,b,c]);assert.equal(calls,2);assert.equal(max,1);await assert.rejects(get('brz',{...factory,skin:'fail'}));await get('camaro',factory);assert.equal(calls,4);assert.equal(max,1);assert.notEqual(portraitStyleKey('brz',factory),portraitStyleKey('brz',{...factory,finish:'soft'}));
  });
 }finally{if(root)await act(async()=>root.unmount());await vite.close();dom.window.close();for(const [k,v]of old)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}
});
