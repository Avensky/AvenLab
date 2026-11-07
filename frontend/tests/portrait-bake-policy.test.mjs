import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {BoxGeometry,Group,Mesh,MeshBasicMaterial,Texture} from 'three';

test('live portraits stay cache-only after delayed timers and cancel menu jobs on deployment', {timeout:20000}, async () => {
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true});
  const original=new Map();
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,
    navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,CustomEvent:dom.window.CustomEvent,
    localStorage:dom.window.localStorage,WebGLRenderingContext:class {},IS_REACT_ACT_ENVIRONMENT:true})) {
    original.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  }
  // Exercise timers beyond the old 1500ms deferred bake, without real sleeps.
  let time=0,serial=0;
  const timers=new Map();
  window.setTimeout=(callback,delay=0,...args)=>{
    timers.set(++serial,{due:time+delay,callback:()=>callback(...args)});return serial;
  };
  window.clearTimeout=id=>timers.delete(id);
  const advance=ms=>{
    const end=time+ms;
    while(true){
      const next=[...timers].filter(([,job])=>job.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];
      if(!next)break;
      const[id,job]=next;timers.delete(id);time=job.due;job.callback();
    }
    time=end;
  };
  const bakeHook='virtual:portrait-bake-probe', loaderHook='virtual:portrait-load-probe';
  const vite=await createServer({cacheDir:'node_modules/.vite-portrait-bake-policy',
    optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',
    plugins:[{name:'portrait-bake-probe',enforce:'pre',
      transform(source,id){
        if(id.endsWith('/game/alpha/heroPortraitCache.ts'))
          return source.replace('import("../preview/bakeHeroPortrait")',`import(${JSON.stringify(bakeHook)})`);
        if(id.endsWith('/game/preview/bakeHeroPortrait.ts'))
          return source.replace('"three/examples/jsm/loaders/GLTFLoader.js"',JSON.stringify(loaderHook))
            .replace('"three/examples/jsm/loaders/DRACOLoader.js"',JSON.stringify(loaderHook));
      },
      resolveId(id){if(id===bakeHook||id===loaderHook)return '\0'+id;},
      load(id){
        if(id==='\0'+bakeHook)return `
          export const calls=[];let next=null,held=false,release=null;
          export const waitForCall=()=>new Promise(resolve=>{next=resolve;});
          export function hold(){held=true;}
          export function finish(){held=false;release?.();release=null;}
          export async function bakeHeroPortrait(model,appearance){
            const call={model,appearance};calls.push(call);next?.(call);next=null;
            if(held)await new Promise(resolve=>{release=resolve;});
            return 'data:image/webp;base64,'+btoa(model+appearance.body);
          }
        `;
        if(id==='\0'+loaderHook)return `
          export let pending=null,loads=0,disposals=0;
          export class DRACOLoader {setDecoderPath(){return this;}dispose(){disposals++;}}
          export class GLTFLoader {setDRACOLoader(){return this;}loadAsync(){loads++;return new Promise(resolve=>{pending=resolve;});}}
          export function complete(scene){const done=pending;pending=null;done({scene});}
        `;
      },
    }]});
  const load=p=>vite.ssrLoadModule('/src/'+p);
  let root;
  try {
    const {HeroPortrait}=await load('game/alpha/HeroPortrait.tsx');
    const cache=await load('game/alpha/heroPortraitCache.ts');
    const {useUIStore:ui}=await load('store/menus/uiStore.ts');
    const {FACTORY_APPEARANCE:factory}=await load('vehicles/cosmetics/heroLoadouts.ts');
    const probe=await vite.ssrLoadModule(bakeHook);
    const appearance={...factory,body:'#ef2244'};
    root=createRoot(document.getElementById('root'));
    const render=props=>act(async()=>root.render(h(HeroPortrait,{hero:'brz',appearance,...props})));
    const setScreen=screen=>act(async()=>ui.setState({screen,overlay:null,isModeLoading:false}));
    const tick=ms=>act(async()=>{advance(ms);await Promise.resolve();});
    const portrait=()=>document.querySelector('.hero-portrait-art');

    await setScreen('sandbox');await render({});
    await tick(5000);
    assert.equal(probe.calls.length,0,'driving never starts a delayed bake, even without cacheOnly prop');
    assert.equal(timers.size,0);
    assert.equal(portrait().dataset.style,'deferred');
    assert.equal(portrait().querySelector('img').getAttribute('src'),'/images/heroes/brz.webp');
    await act(async()=>ui.setState({overlay:'pause'}));await tick(5000);
    assert.equal(probe.calls.length,0,'pause overlay still has a live world beneath it');

    await render({cacheOnly:true});await setScreen('heroes');await tick(5000);
    assert.equal(probe.calls.length,0,'explicit cacheOnly remains read-only in menus');
    assert.equal(timers.size,0);
    await render({cacheOnly:false});
    assert.equal(timers.size,1,'a menu may schedule its one styled image');
    await tick(60);await setScreen('sandbox');await tick(5000);
    assert.equal(probe.calls.length,0,'deploying before the menu debounce cancels the bake');
    assert.equal(timers.size,0);

    await setScreen('heroes');
    const started=probe.waitForCall();
    await act(async()=>{advance(120);await started;});
    assert.equal(probe.calls.length,1);
    const cachedImage=cache.peekStyledPortrait('brz',appearance);
    assert.ok(cachedImage?.startsWith('data:image/webp'));
    await setScreen('sandbox');await render({cacheOnly:true});await tick(5000);
    assert.equal(portrait().dataset.style,'ready');
    assert.equal(portrait().querySelector('img').getAttribute('src'),cachedImage,'cached styled portrait is preserved');
    assert.equal(probe.calls.length,1);
    await render({appearance:null,cacheOnly:true});await tick(5000);
    assert.equal(portrait().dataset.style,'factory');
    assert.equal(portrait().querySelector('img').getAttribute('src'),'/images/heroes/brz.webp');
    assert.equal(probe.calls.length,1);

    // A second job can already be waiting in the serial menu queue. The queue
    // entry must check the current screen when it actually begins its work.
    await setScreen('heroes');probe.hold();
    const heldStart=probe.waitForCall();
    const first=cache.getStyledPortrait('brz',{...factory,body:'#111111'});
    await heldStart;
    const second=cache.getStyledPortrait('camaro',{...factory,body:'#222222'});
    const rejected=assert.rejects(second,/menus.*gameplay/);
    await setScreen('sandbox');
    await act(async()=>{probe.finish();await first;await rejected;});
    assert.equal(probe.calls.length,2,'queued menu image did not begin after deployment');

    // Test the real baker too: a menu GLB load that finishes after deployment
    // is disposed before WebGLRenderer/PMREM construction. No WebGL mock here.
    const {bakeHeroPortrait}=await load('game/preview/bakeHeroPortrait.ts');
    const loader=await vite.ssrLoadModule(loaderHook);
    await assert.rejects(bakeHeroPortrait('brz',appearance),/menus.*gameplay/);
    assert.equal(loader.loads,0,'direct callers cannot begin a load while driving');
    await setScreen('heroes');
    const source=new Group(),geometry=new BoxGeometry(),texture=new Texture();
    const material=new MeshBasicMaterial({map:texture});source.add(new Mesh(geometry,material));
    let disposed=0;
    for(const resource of [geometry,material,texture])resource.addEventListener('dispose',()=>disposed++);
    const late=bakeHeroPortrait('brz',appearance);
    const lateRejected=assert.rejects(late,/menus.*gameplay/);
    assert.equal(loader.loads,1);
    await setScreen('sandbox');loader.complete(source);await lateRejected;
    assert.equal(disposed,3,'cancelled loaded geometry/material/texture is released');
    assert.equal(loader.disposals,1,'the decode worker is released on cancellation');
    assert.equal(document.querySelectorAll('canvas').length,0);
  } finally {
    if(root)await act(async()=>root.unmount());
    await vite.close();dom.window.close();
    for(const[key,value]of original){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
  }
});
