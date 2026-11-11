import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

// The real preview owns the React boundaries and camera interpolation. Only
// replace the WebGL surface and asset loading to control exactly when a swap resolves.
function garageTestServer() {
  return createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',
    plugins:[{name:'garage-surface',enforce:'pre',
      transform(source,id){
        if(id.endsWith('/game/preview/VehiclePreview.tsx'))
          return source.replace(/from "(?:@react-three\/(?:fiber|drei)|\.\/(?:VehiclePreviewModel|GarageEnvironment|PreviewTurntable|PreviewLoadingSeal|PreviewContactShadow)|\.\.\/characters\/GarageDriver)"/g,'from "virtual:garage-surface"')
            .replace('import { Html, PerspectiveCamera }','import { Html, PerspectiveCamera, useCharacterActor }')
            .replace('const characterActor = useRef<Group>(null);','const characterActor = useCharacterActor();')
            .replaceAll(' ref={characterActor}', '');
      },
      resolveId(id){if(id==='virtual:garage-surface')return '\0garage-test-surface';},
      load(id){if(id==='\0garage-test-surface')return `
        import {createElement as h, useLayoutEffect, useRef} from 'react';
        import {Group, PerspectiveCamera as Camera} from 'three';
        export const camera = new Camera(), characterCamera = new Camera();
        const turntable = new Group(), scene = new Group(), invalidate = () => {};
        const characterActor = new Group(), characterTurn = new Group(), character = new Group();
        character.name = 'garage-driver'; characterTurn.add(character); characterActor.add(characterTurn);
        export const useCharacterActor = () => useRef(characterActor);
        let renderFrame, pending;
        export function waitForModel(model) {
          let ready;
          const promise = new Promise(resolve => { ready = resolve; });
          pending = { model, promise };
          return () => { pending = null; ready(); };
        }
        export const stepCamera = () => renderFrame({ frameloop: 'always', invalidate, scene }, 1 / 60);
        export const useFrame = callback => useLayoutEffect(() => { renderFrame = callback; }, [callback]);
        export const useThree = selector => selector({ size: { width: 1000, height: 500 }, invalidate });
        export const Html = () => null, PreviewContactShadow = () => null;
        export function PerspectiveCamera({ref, name}) {
          useLayoutEffect(() => { ref.current = name === 'character-preview-camera' ? characterCamera : camera; }, [ref, name]);
          return null;
        }
        export function GarageEnvironment({onSettled}) {
          useLayoutEffect(() => { onSettled(); }, [onSettled]);
          return h('div',{'data-garage':true});
        }
        export function PreviewTurntable({children, onReady}) {
          useLayoutEffect(() => { onReady(turntable); }, [onReady]);
          return h('div',null,children);
        }
        export const PreviewLoadingStatus=({label})=>h('span',{'data-summoning':label});
        export const GarageDriver = ({choice, previewPacks, paused, upright}) => h('span', {
          'data-driver': choice.id, 'data-character-actor': previewPacks, 'data-paused': paused, 'data-upright': upright,
        });
        export function VehiclePreviewModel({model, garageOpen, allowDriver, onSettled, onDriverFit, summon, active, diagnostics}) {
          if (pending?.model === model) throw pending.promise;
          const materialized = useRef(summon);
          useLayoutEffect(() => {
            const markers = ['High Angle', 'Driver Door'].map((view, index) => {
              const marker = new Group();
              marker.name = 'garage-view-' + view;
              marker.position.x = model === 'brz' ? 1 : 5 + index;
              const eye = new Group();
              eye.position.set(2, 3, 4);
              marker.add(eye); turntable.add(marker);
              return marker;
            });
            onSettled(model);
            if (allowDriver) onDriverFit({model,position:[model === 'brz' ? 2 : 9,0,1],scale:1,yaw:0});
            return () => markers.forEach(marker => marker.removeFromParent());
          }, [model, allowDriver, onSettled, onDriverFit]);
          return h('span',{'data-model':model,'data-garage-open':garageOpen,'data-materializes':materialized.current,'data-active':active,'data-diagnostics':diagnostics});
        }
      `;}
    }]});
}

test('the garage falls back to the favorite while keeping the Abilities preview active',async()=>{
  const vite=await garageTestServer();
  try{
    const {VehiclePreview}=await vite.ssrLoadModule('/src/game/preview/VehiclePreview.tsx');
    // useSyncExternalStore uses each store's initial snapshot during SSR.
    const {useUIStore:ui}=await vite.ssrLoadModule('/src/store/menus/uiStore.ts');
    const {useAlphaStore:alpha}=await vite.ssrLoadModule('/src/store/alpha/alphaStore.ts');
    const current=alpha.getInitialState(),screen=ui.getInitialState(),saved={hero:current.hero,previewHero:current.previewHero};
    const original=screen.screen;screen.screen='hero_select';
    const render=()=>renderToString(createElement(VehiclePreview,{awaitingHero:true}));
    try{
      Object.assign(current,{hero:null,previewHero:'brz'});
      assert.match(render(),/data-garage/);assert.match(render(),/data-model="ae86"/);
      Object.assign(current,{hero:'mechanic',previewHero:'brz'});
      assert.match(render(),/data-model="fortuner"/);
      assert.match(render(),/data-summoning="Summoning vehicle"/);
      Object.assign(current,{hero:null,previewHero:null});assert.match(render(),/data-model="ae86"/);
      screen.screen='heroes';current.previewHero='mini';assert.match(render(),/data-model="mini"/);
      const {useCharacterPreviewStore}=await vite.ssrLoadModule('/src/game/characters/characterPreviewStore.ts');
      const {useVehicleStudioStore}=await vite.ssrLoadModule('/src/game/heroes/vehicleStudioStore.ts');
      const preview=useCharacterPreviewStore.getInitialState();
      const studio=useVehicleStudioStore.getInitialState(),previousTab=studio.activeTab;
      try {
        studio.activeTab='abilities';
        assert.match(render(),/data-garage-open="true"/);
        preview.insideCar=true;
        const wardrobe=renderToString(createElement(VehiclePreview,{awaitingHero:true,wardrobeOpen:true}));
        assert.match(wardrobe,/data-model="mini"/);
        assert.match(wardrobe,/data-diagnostics="false"/);
        assert.match(render(),/data-model="mini"/);
      } finally { preview.insideCar=false;studio.activeTab=previousTab; }
    }finally{Object.assign(current,saved);screen.screen=original;}
  }finally{await vite.close();}
});

test('a delayed vehicle swap retains the camera and mounted driver until a new shot is chosen',async()=>{
  const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost'});
  const globals = {window:dom.window, document:dom.window.document, localStorage:dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT:true};
  const prior = Object.fromEntries(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for (const [key,value] of Object.entries(globals)) Object.defineProperty(globalThis,key,{value,configurable:true});
  const vite = await garageTestServer();
  const root = createRoot(document.getElementById('root'));
  const load = path => vite.ssrLoadModule('/src/'+path);
  try {
    const {VehiclePreview} = await load('game/preview/VehiclePreview.tsx');
    const {useUIStore} = await load('store/menus/uiStore.ts');
    const {useAlphaStore} = await load('store/alpha/alphaStore.ts');
    const {usePreferencesStore} = await load('store/preferences/preferencesStore.ts');
    const {useGarageDrive} = await load('game/preview/garageDriveStore.ts');
    const {useCharacterPreviewStore} = await load('game/characters/characterPreviewStore.ts');
    const {useVehicleStudioStore} = await load('game/heroes/vehicleStudioStore.ts');
    const {camera,characterCamera,stepCamera,waitForModel} = await vite.ssrLoadModule('virtual:garage-surface');
    useUIStore.setState({screen:'heroes'});
    useAlphaStore.setState({previewHero:'brz'});
    useVehicleStudioStore.getState().setActiveTab('performance');
    useGarageDrive.setState({camera:'High Angle', stage:'station'});
    await act(async()=>root.render(createElement(VehiclePreview,{awaitingHero:true})));
    stepCamera();
    assert.equal(camera.position.x,3);
    const position = camera.position.clone(), rotation = camera.quaternion.clone();
    const driver = document.querySelector('[data-driver]');
    assert(driver);
    const stance = driver.parentElement.getAttribute('position');
    const vehicle = document.querySelector('[data-model="brz"]');
    await act(async()=>root.render(createElement(VehiclePreview,{awaitingHero:true,wardrobeOpen:true,characterOnly:true})));
    stepCamera();
    assert.equal(document.querySelector('[data-model="brz"]'),vehicle,'the vehicle stays mounted');
    assert.equal(vehicle.dataset.active,'false','the fitting room suspends the vehicle');
    assert.equal(driver.dataset.paused,'true');
    assert(document.querySelector('[data-character-actor="true"][data-upright="true"]'));
    assert(characterCamera.position.distanceTo(position)>.5,'the fitting room uses a separate centered camera');
    assert.equal(useCharacterPreviewStore.getState().cockpitVehicle,null);
    await act(async()=>root.render(createElement(VehiclePreview,{awaitingHero:true,wardrobeOpen:true})));
    stepCamera();
    assert.equal(vehicle.dataset.active,'true','the Emotes tab keeps its vehicle');
    assert.equal(useCharacterPreviewStore.getState().cockpitVehicle,'brz');
    await act(async()=>root.render(createElement(VehiclePreview,{awaitingHero:true})));
    stepCamera();
    assert.equal(driver.dataset.paused,'false');
    assert.equal(useGarageDrive.getState().stage,'station');
    assert(camera.position.distanceTo(position)<1e-8);
    assert(camera.quaternion.angleTo(rotation)<1e-6);
    const finish = waitForModel('mini');
    await act(async()=>useAlphaStore.setState({previewHero:'mini'}));
    stepCamera();
    assert.equal(document.querySelector('[data-model]'),null);
    assert.equal(document.querySelector('[data-driver]'),driver);
    assert(camera.position.distanceTo(position)<1e-8);
    await act(async()=>finish());
    for (let frame=0;frame<15;frame++) stepCamera();
    assert.equal(document.querySelector('[data-model="mini"]').dataset.materializes,'true');
    assert.equal(document.querySelector('[data-driver]'),driver);
    assert.equal(driver.parentElement.getAttribute('position'),stance);
    assert(camera.position.distanceTo(position)<1e-8);
    assert(camera.quaternion.angleTo(rotation)<1e-6);
    assert.equal(useGarageDrive.getState().camera,'High Angle');
    await act(async()=>useGarageDrive.getState().nextCamera());
    for (let frame=0;frame<15;frame++) stepCamera();
    assert(camera.position.distanceTo(position)>.5);
    await act(async()=>{
      usePreferencesStore.getState().update({reducedMotion:true});
      useAlphaStore.setState({previewHero:'tank'});
    });
    assert.equal(document.querySelector('[data-model="tank"]').dataset.materializes,'false');
    assert.equal(document.querySelector('[data-driver]'),driver);
  } finally {
    await act(async()=>root.unmount());
    await vite.close();
    dom.window.close();
    for (const [key,descriptor] of Object.entries(prior)) {
      if (descriptor) Object.defineProperty(globalThis,key,descriptor);
      else delete globalThis[key];
    }
  }
});
