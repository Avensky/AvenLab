import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act, createElement as h} from 'react';
import {createRoot} from 'react-dom/client';

test('HUD widgets compose independently and old parent gates migrate once', async t => {
  const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost',pretendToBeVisual:true}), previous = new Map();
  for (const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true})) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  }
  const vite = await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',cacheDir:'node_modules/.vite-independent-hud-test'}), load = path => vite.ssrLoadModule('/src/'+path);
  const root = createRoot(document.getElementById('root'));
  try {
    const {usePreferencesStore:prefs,sanitizePreferences,DEFAULT_PREFERENCES}=await load('store/preferences/preferencesStore.ts');
    const {HUD_GROUPS}=await load('store/preferences/hudVisibility.ts');
    const {useHudPanelsStore:panels}=await load('store/hud/hudPanelsStore.ts');
    const {useUIStore:ui}=await load('store/menus/uiStore.ts');
    const {useInputStore:input}=await load('store/input/inputStore.ts');
    const {UtilityDock}=await load('ui/hud/UtilityDock.tsx');
    const {default:ControlsPanel}=await load('ui/ControlsPanel.tsx');
    const {default:Steering}=await load('ui/Steering.tsx');
    const {ClimatePage}=await load('ui/Cockpit/panels/ClimatePage.tsx');
    const allHidden=Object.fromEntries(HUD_GROUPS.map(id=>[id,false]));
    const setOnly=async (...ids)=>act(async()=>{
      prefs.getState().update({showDriveControls:false,showTouchControls:false,hudGroups:{...allHidden,...Object.fromEntries(ids.map(id=>[id,true]))}});
      panels.setState({map:true,radio:true,climate:true});
    });
    ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});
    await t.test('legacy effective visibility is retained and a migrated layout no longer has hidden parents',()=>{
      const old=sanitizePreferences({showTouchControls:false,showDriveControls:false,researchHud:true,climateHudSize:'compact',hudGroups:{wheel:true,stalks:true,pedals:true,climate:true,hazards:true,display:true,shifter:true,gauges:true,futuristic:true}});
      for (const id of ['wheel','stalks','pedals','turret','climate','hazards','display','missions','performance','shifter']) assert.equal(old.hudGroups[id],false,id);
      assert.equal(old.hudGroups.gauges,true);assert.equal(old.hudGroups.futuristic,true);assert.equal(old.hudVisibilityVersion,2);
      const migrated=sanitizePreferences({...old,showTouchControls:false,showDriveControls:false,researchHud:true,hudGroups:{...old.hudGroups,climate:true,display:true,pedals:true}});
      assert.equal(migrated.hudGroups.climate,true);assert.equal(migrated.hudGroups.display,true);assert.equal(migrated.hudGroups.pedals,true);assert.equal(migrated.showTouchControls,true);assert.equal(migrated.showDriveControls,true);
      assert.deepEqual(sanitizePreferences(migrated),migrated,'migration is idempotent');
      assert.equal(sanitizePreferences({showDriveControls:true,researchHud:true,climateHudSize:'compact',hudGroups:{climate:true,hazards:true}}).hudGroups.performance,true,'old visible performance is preserved');
      assert.equal(sanitizePreferences({showDriveControls:true,researchHud:false,hudGroups:{climate:true,hazards:true}}).hudGroups.hazards,false,'hidden legacy child does not appear on upgrade');
    });
    await t.test('bulk presets can be followed by a single widget without revealing siblings',async()=>{
      await setOnly('climate');
      for(const id of HUD_GROUPS) assert.equal(prefs.getState().hudGroups[id],id==='climate',id);
      assert.equal(prefs.getState().showDriveControls,true);
      prefs.getState().setHudGroup('pedals',true);
      assert.equal(prefs.getState().showTouchControls,true);assert.equal(prefs.getState().hudGroups.wheel,false);assert.equal(prefs.getState().hudGroups.turret,false);
      const saved=JSON.parse(localStorage.getItem('avenlab-preferences-v1')).state;
      assert.equal(saved.hudVisibilityVersion,2);assert.equal(sanitizePreferences(saved).hudGroups.climate,true);assert.equal(sanitizePreferences(saved).hudGroups.pedals,true);
    });
    await t.test('single climate bar omits performance, and performance works by itself',async()=>{
      await setOnly('climate');await act(async()=>{prefs.getState().update({climateHudSize:'single'});root.render(h(UtilityDock));});
      assert.equal(document.querySelector('.climate-panel').dataset.size,'single');assert.equal(document.querySelector('.cabin-performance'),null);assert.equal(document.querySelector('.climate-three-knobs'),null);assert.equal(document.querySelector('.cockpit-radio'),null);assert.equal(document.querySelector('.hud-minimap'),null);
      await setOnly('performance');assert(document.querySelector('.cabin-performance'));assert.equal(document.querySelector('.climate-panel'),null);assert.equal(document.querySelector('.cockpit-radio'),null);
      await setOnly('climate','performance');assert(document.querySelector('.climate-panel'));assert(document.querySelector('.utility-readouts .cabin-performance'),'explicit combination retains the single climate bar and separate readout');
    });
    await t.test('radio, Missions and hazards each work without their former parent',async()=>{
      await setOnly('missions');assert(document.querySelector('.mission-apps'));assert.equal(document.querySelector('.cockpit-radio'),null);assert(document.querySelector('[aria-label="Minimize missions"]'));
      await setOnly('display');assert(document.querySelector('.cockpit-radio'));assert.equal(document.querySelector('.mission-apps'),null);assert.equal(document.querySelector('[aria-label="Missions"]'),null);
      await setOnly('hazards');assert(document.querySelector('[aria-label="Hazards"]'));assert.equal(document.querySelector('.climate-panel'),null);
    });
    await t.test('physical controls and wheel levers can each be the only widget',async()=>{
      await setOnly('shifter');await act(async()=>root.render(h(ControlsPanel)));assert(document.querySelector('.hud-shifter'));assert.equal(document.querySelector('.pedal-hud'),null);assert.equal(document.querySelector('.hud-parking'),null);assert.equal(document.querySelector('.ignition-hud'),null);
      await setOnly('pedals');assert(document.querySelector('.pedal-hud'));assert.equal(document.querySelector('.hud-shifter'),null);assert.equal(document.querySelector('.hud-assists'),null);
      await setOnly('stalks');await act(async()=>root.render(h(Steering)));assert(document.querySelector('.column-stalks'));assert.equal(document.querySelector('.wheel-rotor'),null);
      await setOnly('wheel');assert(document.querySelector('.wheel-rotor'));assert.equal(document.querySelector('.column-stalks'),null);
    });
    await t.test('single bar preset and independent performance switch change no vehicle input',async()=>{
      await setOnly('climate','performance');const before=structuredClone(input.getState().input);
      await act(async()=>root.render(h(ClimatePage)));
      await act(async()=>document.querySelector('[aria-label="SINGLE BAR HUD"]').click());
      assert.equal(prefs.getState().climateHudSize,'single');assert.equal(prefs.getState().hudGroups.performance,false);assert.equal(prefs.getState().hudGroups.climate,true);assert.equal(prefs.getState().hudGroups.hazards,false);
      await act(async()=>document.querySelector('[aria-label="Performance readout on driving HUD"]').click());
      assert.equal(prefs.getState().hudGroups.performance,true);assert.equal(prefs.getState().climateHudSize,'single');assert.deepEqual(input.getState().input,before);
      await act(async()=>prefs.setState(DEFAULT_PREFERENCES));
    });
  } finally {
    await act(async()=>root.unmount());await vite.close();dom.window.close();
    for(const [key,value] of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
  }
});
