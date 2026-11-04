import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';

test('Career, Settings and Worlds/Social share themed controller chrome without changing their owners',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),saved=new Map();let vite,root;
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,HTMLSelectElement:dom.window.HTMLSelectElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true})){
  saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};document.hasFocus=()=>true;
 try{
  vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});const load=path=>vite.ssrLoadModule('/src/'+path);
  const {ThemeController}=await load('theme/ThemeController.tsx'),{usePreferencesStore:prefs}=await load('store/preferences/preferencesStore.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts');
  const {CareerMenu}=await load('game/menus/CareerMenu.tsx'),{SettingsMenu}=await load('game/menus/SettingsMenu.tsx'),{SocialPanel}=await load('game/social/SocialPanel.tsx');
  const {SelectionHeader,SelectionFooter}=await load('game/alpha/SelectionChrome.tsx');
  social.setState({available:true,message:'CONNECTED',view:{profile:{id:'player',name:'FRAME DRIVER'},players:[],teammates:[],requests:[],groups:[],world_invites:[],current_world_id:null,worlds:[],maps:['road_precision'],limits:{active_worlds:0,max_active_worlds:3,active_players:1,max_players:10}}});
  root=createRoot(document.getElementById('root'));
  const render=async(component,screen)=>{await act(async()=>{ui.setState({screen,overlay:null});root.render(h('div',null,h(ThemeController),h(component)));});};
  for(const [Component,screen,title]of [[CareerMenu,'career','CAREER'],[SettingsMenu,'settings','SETTINGS'],[SocialPanel,'social','WORLDS & SOCIAL']])await t.test(`${title} uses the same frame and a native B action`,async()=>{
   await render(Component,screen);assert(document.querySelector('.menu-frame[role="dialog"]'));assert.equal(document.querySelector('.menu-frame-header h1').textContent.toUpperCase(),title);
   assert(document.querySelector('.menu-frame-header [data-controller-key="B"]'));assert(document.querySelector('.menu-frame-footer [aria-label="Menu shortcuts"]'));
   assert(document.querySelector('.menu-frame-tabs [role="tab"][aria-selected="true"]'));
   for(const theme of ['white','strawberry','deep-purple','navy']){await act(async()=>prefs.getState().update({theme}));assert.equal(document.documentElement.dataset.uiTheme,theme);assert(document.documentElement.style.getPropertyValue('--app-panel'));}
   assert.equal(social.getState().view.profile.id,'player','styling never changes the authenticated player');
  });
  await t.test('Settings still updates preferences and Social keeps world creation behind its request owner',async()=>{
   await render(SettingsMenu,'settings');const previous=prefs.getState().showTouchControls;const hud=[...document.querySelectorAll('[role="tab"]')].find(node=>node.textContent==='HUD');assert(hud);await act(async()=>hud.click());const row=document.querySelector('[data-menu-row="touch-visible"]');
   assert(row);await act(async()=>row.click());assert.notEqual(prefs.getState().showTouchControls,previous);
   await render(SocialPanel,'social');assert(document.querySelector('input[aria-label="WORLD INVITE CODE"]')||document.querySelector('input'));
   assert([...document.querySelectorAll('button')].some(button=>button.textContent.includes('CREATE & JOIN')));
   assert.equal(ui.getState().screen,'social');
   await act(async()=>document.querySelector('.menu-frame-header button').click());assert.equal(ui.getState().screen,'main');
  });
  await t.test('Play and Hero chrome reuse the same controller components without an opaque scene shell',async()=>{
   let backs=0;
   for(const title of ['PLAY','HEROES']){
    await act(async()=>root.render(h('section',{className:'hero-selection'},h(SelectionHeader,{title,eyebrow:`${title} LABEL`,onBack:()=>backs++}),h('main',{'aria-label':'Open garage scene'}),h(SelectionFooter,{chat:true,secondaryTabs:true,selectLabel:'Choose hero'},h('button',null,'CONTINUE')))));
    assert.equal(document.querySelector('.menu-frame'),null,'shared chrome must not add the opaque full-screen panel');
    assert.equal(document.querySelector('.menu-frame-header h1').textContent,title);
    assert.equal(document.querySelector('.menu-frame-header small').textContent,`${title} LABEL`);
    assert.equal(document.querySelector('.menu-frame-header').dataset.menuChrome,'scene');
    assert.equal(document.querySelector('.menu-frame-footer').dataset.menuChrome,'scene');
    assert(document.querySelector('.menu-frame-footer[data-controller-row]'));
    const shortcuts=document.querySelector('[aria-label="Menu shortcuts"]');
    assert.match(shortcuts.textContent,/Choose hero/);assert.match(shortcuts.textContent,/Chat/);assert.match(shortcuts.textContent,/Field/);
    assert(document.querySelector('.menu-frame-header [data-controller-key="B"]'));
    await act(async()=>document.querySelector('.menu-frame-header button').click());
   }
   assert.equal(backs,2);assert.equal(social.getState().view.profile.id,'player');
  });
 }finally{if(root)await act(async()=>root.unmount());await vite?.close();dom.window.close();for(const[key,value]of saved)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});
