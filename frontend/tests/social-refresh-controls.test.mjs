import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h,Fragment} from 'react';
import {createRoot} from 'react-dom/client';

test('Worlds and Social X refresh is one contextual controller action',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map(),frames=new Map();
 let serial=0,vite,root;
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,HTMLSelectElement:dom.window.HTMLSelectElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:callback=>{frames.set(++serial,callback);return serial;},cancelAnimationFrame:id=>frames.delete(id)})){
  old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 document.hasFocus=()=>true;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
 HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.attachEvent=()=>{};HTMLElement.prototype.detachEvent=()=>{};
 const pad={connected:true,index:0,id:'social-refresh-controller',axes:[0,0,0,0],buttons:Array.from({length:18},()=>({pressed:false,value:0}))};navigator.getGamepads=()=>[pad];
 const poll=()=>act(async()=>{const next=frames.entries().next().value;assert(next,'controller frame exists');const[id,callback]=next;frames.delete(id);callback(performance.now());});
 const press=async held=>{pad.buttons[2]={pressed:held,value:Number(held)};await poll();};
 const key=async(options={})=>act(async()=>document.querySelector('.social-panel').dispatchEvent(new window.KeyboardEvent('keydown',{code:'KeyX',key:'x',bubbles:true,cancelable:true,...options})));
 const sent=[];
 try{
  vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}});
  const load=path=>vite.ssrLoadModule('/src/'+path);
  const {SocialPanel}=await load('game/social/SocialPanel.tsx'),{GameController}=await load('controls/GameController.ts'),client=await load('net/socialClient.ts');
  const {useUIStore:ui}=await load('store/menus/uiStore.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts'),{useTextKeyboardStore:keyboard}=await load('store/text/keyboardStore.ts');
  client.setSocialConnection({readyState:WebSocket.OPEN,send:body=>sent.push(JSON.parse(body))});
  ui.setState({screen:'social',overlay:null,isModeLoading:false});social.setState({available:true,view:null});
  root=createRoot(document.getElementById('root'));await act(async()=>root.render(h(Fragment,null,h(GameController),h(SocialPanel))));await poll();
  const button=()=>document.querySelector('[data-social-refresh]');
  const reply=()=>act(async()=>client.receiveSocialResult({request_id:sent.at(-1).request_id,ok:true,data:{}}));
  await t.test('click and X use the same pending guard and accessible Xbox footer button',async()=>{
   assert(button().querySelector('[data-controller-key=X]'));assert.equal(button().getAttribute('aria-label'),'Refresh worlds and social');
   await act(async()=>button().click());assert.equal(sent.length,1);assert.equal(sent[0].action,'refresh');assert(button().disabled);
   await press(true);await poll();assert.equal(sent.length,1);await press(false);await reply();assert(!button().disabled);
  });
  await t.test('one refresh per controller press, including held frames',async()=>{
   button().focus();await press(true);assert.equal(sent.length,2);await poll();assert.equal(sent.length,2);await reply();await poll();assert.equal(sent.length,2,'completion does not repeat a held X');
   await press(false);await press(true);assert.equal(sent.length,3);await press(false);await reply();
  });
  await t.test('keyboard X refreshes; typing, repeat and modified shortcuts remain native',async()=>{
   await key();assert.equal(sent.length,4);await reply();
   await key({repeat:true});await key({ctrlKey:true});await key({shiftKey:true});assert.equal(sent.length,4);
   const input=document.createElement('input');document.querySelector('.social-panel').append(input);input.focus();
   await act(async()=>input.dispatchEvent(new window.KeyboardEvent('keydown',{code:'KeyX',key:'x',bubbles:true,cancelable:true})));await press(true);assert.equal(sent.length,4);
   await press(false);input.blur();input.remove();button().focus();await poll();
  });
  await t.test('offline, loading, assisted keyboard and other menus cannot trigger refresh',async()=>{
   await act(async()=>social.setState({available:false}));await press(true);await press(false);await key();assert.equal(sent.length,4);assert(button().disabled);
   await act(async()=>{social.setState({available:true});ui.setState({isModeLoading:true});});await poll();await press(true);await press(false);await key();assert.equal(sent.length,4);
   await act(async()=>{ui.setState({isModeLoading:false});keyboard.setState({session:{id:'typing',value:'',label:'Name'}});});await poll();await press(true);await press(false);await key();assert.equal(sent.length,4);
   await act(async()=>{keyboard.setState({session:null});ui.setState({screen:'heroes',overlay:null});});await poll();await press(true);await press(false);assert.equal(sent.length,4);
  });
  await act(async()=>client.setSocialConnection(null));
 }finally{
  if(root)await act(async()=>root.unmount());await vite?.close();dom.window.close();for(const[key,value]of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];
 }
});
