import assert from 'node:assert/strict';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {act, createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {PerspectiveCamera} from 'three';
import {createServer} from 'vite';

test('gallery frames move the camera and save one resume angle on exit', async () => {
  const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost/'});
  const old = new Map();
  for (const [key, value] of Object.entries({window:dom.window, document:dom.window.document,
    localStorage:dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT:true})) {
    old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  }
  let root, vite, unsubscribe;
  try {
    const hook = 'virtual:gallery-frame-probe';
    vite = await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',
      plugins:[{name:'gallery-frame-probe',enforce:'pre',
        transform(source, id) {
          if (id.endsWith('/effects/RotatingCamera.tsx')) return source.replace('"@react-three/fiber"', JSON.stringify(hook));
        },
        resolveId(id) { if (id===hook) return '\0'+hook; },
        load(id) { if (id==='\0'+hook) return 'export let advance; export let camera; export function setCamera(c){camera=c} export function useThree(){return {camera}} export function useFrame(cb){advance=cb}'; },
      }]});
    const load=id=>vite.ssrLoadModule(id);
    const {RotatingCamera}=await load('/src/effects/RotatingCamera.tsx');
    const probe=await load(hook);
    const {useGameStore:game,useUIStore:ui}=await load('/src/store/index.ts');
    const camera = new PerspectiveCamera();
    probe.setCamera(camera);
    game.setState({camera:'GALLERY',rotatingCamera:1});
    ui.setState({screen:'sandbox_setup'});
    let writes=0;
    unsubscribe=game.subscribe(()=>writes++);
    root=createRoot(document.getElementById('root'));
    await act(async()=>root.render(createElement(RotatingCamera,{orbitRef:{current:null},speed:0.2})));
    for(let frame=0;frame<120;frame++) probe.advance();
    assert(camera.position.length()>0);
    assert.equal(writes,0);
    await act(async()=>root.render(null));
    assert.equal(writes,1);
    assert(Math.abs(game.getState().rotatingCamera-1.24)<1e-9);
  } finally {
    unsubscribe?.(); if(root) await act(async()=>root.unmount());
    await vite?.close();dom.window.close();
    for(const [key,desc] of old){if(desc)Object.defineProperty(globalThis,key,desc);else delete globalThis[key];}
  }
});
