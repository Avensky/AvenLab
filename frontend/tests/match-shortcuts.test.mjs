import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {createServer} from 'vite';import {createElement as h,act} from 'react';import {createRoot} from 'react-dom/client';
test('hold Tab and F1 share gameplay focus rules without taking driving ownership',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),original=new Map();let server,root,tick=0;
 for(const[k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true})){original.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}
 document.hasFocus=()=>true;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
 try{
  server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});const load=p=>server.ssrLoadModule('/src/'+p);
  const {Keyboard}=await load('controls/Keyboard.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),{useNetworkStore:network}=await load('store/session/networkStore.ts'),{useInputStore:input}=await load('store/input/inputStore.ts'),{useScoreboardStore:board}=await load('store/hud/scoreboardStore.ts'),{useCanDataStore:can}=await load('store/recon/canDataStore.ts'),{useGameStore:game}=await load('store/presentation/gameStore.ts'),{canDrive}=await load('controls/inputRouting.ts');
  const entity={id:'me',vehicle_id:'tank',team:'red',room_id:1,position:[0,1,0],rotation:[0,0,0,1],vehicle_mask:1,player_mask:0};
  const send=()=>network.getState().setSnapshot({tick:++tick,entities:[{...entity}]},performance.now());
  const event=async(type,code,options={},target=window)=>{const value=new window.KeyboardEvent(type,{code,bubbles:true,cancelable:true,...options});await act(async()=>target.dispatchEvent(value));return value;};
  const down=(code,options={},target=window)=>event('keydown',code,options,target),up=(code,options={},target=window)=>event('keyup',code,options,target),press=async code=>{await down(code);await up(code);};
  const reset=async()=>{await act(async()=>{board.getState().close();ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});game.setState({editor:false});can.setState({commandOpen:false});network.setState({playerId:'me',connected:true});send();window.dispatchEvent(new window.Event('focus'));});};
  await reset();root=createRoot(document.getElementById('root'));await act(async()=>root.render(h(Keyboard)));
  await t.test('Tab holds stats, consumes browser focus and leaves acceleration available',async()=>{
   await down('KeyW');assert.equal(input.getState().input.throttle,1);const tab=await down('Tab');assert.equal(tab.defaultPrevented,true);assert.equal(board.getState().held,true);assert.equal(canDrive(),true);assert.equal(input.getState().input.throttle,1);
   await down('Tab',{repeat:true});assert.equal(board.getState().held,true);await up('Tab');assert.equal(board.getState().held,false);assert.equal(input.getState().input.throttle,1);await up('KeyW');assert.equal(input.getState().input.throttle,0);
   await down('Tab',{repeat:true});assert.equal(board.getState().held,false);
  });
  await t.test('typing, menus, editor, terminal, stale data and modifiers cannot open stats',async()=>{
   const typing=document.createElement('input');document.body.append(typing);await down('Tab',{},typing);assert.equal(board.getState().held,false);typing.remove();
   for(const modifier of ['shiftKey','ctrlKey','altKey','metaKey']){await down('Tab',{[modifier]:true});assert.equal(board.getState().held,false);}
   for(const patch of [{overlay:'pause'},{screen:'heroes'},{isModeLoading:true}]){await reset();ui.setState(patch);await down('Tab');assert.equal(board.getState().held,false);}
   await reset();game.setState({editor:true});await down('Tab');assert.equal(board.getState().held,false);await reset();can.setState({commandOpen:true});await down('Tab');assert.equal(board.getState().held,false);
   await reset();network.setState(s=>({snapshot:{...s.snapshot,received_at_ms:performance.now()-2000}}));await down('Tab');assert.equal(board.getState().held,false);await reset();network.setState({connected:false});await down('Tab');assert.equal(board.getState().held,false);
  });
  await t.test('release from chat, menu, blur, disconnect and unmount cannot leave stats stuck',async()=>{
   await reset();await down('Tab');const typing=document.createElement('input');document.body.append(typing);typing.addEventListener('keyup',e=>e.stopPropagation());await up('Tab',{},typing);assert.equal(board.getState().held,false);typing.remove();
   for(const stop of [()=>ui.setState({overlay:'pause'}),()=>window.dispatchEvent(new window.Event('blur')),()=>network.setState({connected:false}),()=>can.setState({commandOpen:true})]){await reset();await down('Tab');assert.equal(board.getState().held,true);await act(async()=>stop());assert.equal(board.getState().held,false);}
   await reset();board.getState().toggle();assert.equal(board.getState().pinned,true);await down('Tab');await up('Tab');assert.equal(board.getState().pinned,true,'Tab release preserves a deliberately pinned mobile board');await act(async()=>window.dispatchEvent(new window.Event('blur')));assert.equal(board.getState().pinned,false);
   await reset();await down('Tab');await act(async()=>root.render(null));assert.equal(board.getState().held,false);await act(async()=>root.render(h(Keyboard)));
  });
  await t.test('F1 opens hero abilities, releases held driving and returns to the same screen',async()=>{
   await reset();await down('KeyW');assert.equal(input.getState().input.throttle,1);const key=await down('F1');assert.equal(key.defaultPrevented,true);assert.equal(ui.getState().overlay,'hero_abilities');assert.equal(ui.getState().screen,'sandbox');assert.equal(input.getState().input.throttle,0);assert.equal(canDrive(),false);
   await down('F1',{repeat:true});assert.equal(ui.getState().overlay,'hero_abilities');await press('F1');assert.equal(ui.getState().overlay,null);assert.equal(ui.getState().screen,'sandbox');assert.equal(input.getState().input.throttle,0,'closing help never replays a held accelerator');
   for(const screen of ['heroes','hero_select','mode_select']){await reset();ui.setState({screen});await press('F1');assert.equal(ui.getState().overlay,'hero_abilities');await press('F1');assert.equal(ui.getState().overlay,null);assert.equal(ui.getState().screen,screen);}
  });
  await t.test('F1 leaves typing, terminal, unrelated overlays and browser modifiers alone',async()=>{
   await reset();const typing=document.createElement('input');document.body.append(typing);const typed=await down('F1',{},typing);assert.equal(typed.defaultPrevented,false);assert.equal(ui.getState().overlay,null);typing.remove();
   for(const modifier of ['shiftKey','ctrlKey','altKey','metaKey']){const key=await down('F1',{[modifier]:true});assert.equal(key.defaultPrevented,false);assert.equal(ui.getState().overlay,null);}
   for(const patch of [{overlay:'settings'},{screen:'main'},{isModeLoading:true}]){await reset();ui.setState(patch);const key=await down('F1');assert.equal(key.defaultPrevented,false);assert.notEqual(ui.getState().overlay,'hero_abilities');}
   await reset();can.setState({commandOpen:true});const key=await down('F1');assert.equal(key.defaultPrevented,false);assert.equal(ui.getState().overlay,null);
  });
 }finally{if(root)await act(async()=>root.unmount());await server?.close();dom.window.close();for(const[k,v]of original){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
});
