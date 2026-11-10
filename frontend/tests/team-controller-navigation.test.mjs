import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {createServer} from 'vite';import {act,createElement as h} from 'react';import {createRoot} from 'react-dom/client';

test('team filters and Heroes respect controller ownership',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map(),frames=new Map();let serial=0,vite,root;
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:cb=>{frames.set(++serial,cb);return serial;},cancelAnimationFrame:id=>frames.delete(id)})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 document.hasFocus=()=>true;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
 const pad={connected:true,index:0,id:'team-filter-controller',axes:[0,0,0,0],buttons:Array.from({length:18},()=>({pressed:false,value:0}))};navigator.getGamepads=()=>[pad];
 const poll=()=>act(async()=>{const[id,fn]=frames.entries().next().value;frames.delete(id);fn(performance.now());});
 const press=async(index,held)=>{pad.buttons[index]={pressed:held,value:Number(held)};await poll();};
 try{
  vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}});const load=p=>vite.ssrLoadModule('/src/'+p);
  const {GameController}=await load('controls/GameController.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),{useNetworkStore:network}=await load('store/session/networkStore.ts'),{useInputStore:input}=await load('store/input/inputStore.ts'),{useScoreboardStore:board}=await load('store/hud/scoreboardStore.ts'),{useCombatStore:combat}=await load('combat/combatStore.ts');
  const {Keyboard}=await load('controls/Keyboard.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts'),client=await load('net/socialClient.ts'),{VehicleFlags}=await load('store/input/protocol/inputMasks.ts');
  ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});network.setState({connected:true,playerId:'tank',snapshot:{tick:1,entities:[{id:'tank',vehicle_id:'tank',team:'red',room_id:1,rotation:[0,0,0,1],combat:{enabled:true,cannon_reload:0,coax_reload:0,basket_reload:0}}]}});combat.getState().setEnabled(true);root=createRoot(document.getElementById('root'));await act(async()=>root.render(h(GameController)));await poll();
  await t.test('composition LT/RT change only team filter and held trigger cannot turn into reverse',async()=>{
   await act(async()=>board.setState({pinned:true,view:'composition',teamFilter:'all'}));await press(6,true);assert.equal(board.getState().teamFilter,'blue');assert.equal(input.getState().input.throttle,0);await poll();assert.equal(board.getState().teamFilter,'blue');assert.equal(input.getState().input.throttle,0);
   await press(6,false);await press(7,true);assert.equal(board.getState().teamFilter,'all');assert.equal(input.getState().input.throttle,0);await press(7,false);
  });
  await t.test('B closes composition even with a trigger held and cannot engage the e-brake',async()=>{
   await press(6,true);await press(1,true);assert.equal(board.getState().pinned,false);assert.equal(input.getState().input.handbrake,0);assert.equal(input.getState().input.throttle,0);await press(1,false);await press(6,false);await poll();
  });
  await t.test('Stats preserves the driving triggers because it has no team filter',async()=>{
   await act(async()=>board.setState({pinned:true,view:'table'}));await poll();await press(7,true);assert.equal(input.getState().input.throttle,1);await press(7,false);await act(async()=>board.getState().close());
  });
  await t.test('Y in Heroes leaves the current page and secondary weapon alone',async()=>{
   let calls=0;const handle=()=>calls++;window.addEventListener('avenlab:hero-abilities',handle);
   try{
    await act(async()=>ui.setState({screen:'heroes',overlay:null}));await poll();
    const weapon=combat.getState().secondaryWeapon;
    await press(3,true);await poll();await press(3,false);
    assert.equal(calls,0);assert.equal(ui.getState().overlay,null);
    assert.equal(combat.getState().secondaryWeapon,weapon);
   }finally{window.removeEventListener('avenlab:hero-abilities',handle);}
  });
  await t.test('result overlay routes LT/RT secondary tabs without drive input',async()=>{
   await act(async()=>ui.setState({screen:'sandbox',overlay:'match_results'}));await poll();const actions=[];const handle=e=>actions.push(e.detail);window.addEventListener('avenlab:panel-action',handle);
   try{await press(7,true);assert.deepEqual(actions,['next_option']);await poll();assert.equal(actions.length,1);assert.equal(input.getState().input.throttle,0);await press(7,false);await press(6,true);assert.deepEqual(actions,['next_option','previous_option']);await press(6,false);}finally{window.removeEventListener('avenlab:panel-action',handle);}
  });
  await t.test('Mechanic U and LB issue the same recovery action without accidentally boosting',async()=>{
   const sent=[];client.setSocialConnection({readyState:WebSocket.OPEN,send:body=>sent.push(JSON.parse(body))});
   const actor={id:'mechanic',vehicle_id:'fortuner',team:'red',room_id:1,position:[0,1,0],rotation:[0,0,0,1],speed:0,health:{hp:500,max_hp:500,defeated:false,revive_cooldown_s:0}},target={...actor,id:'ally',position:[6,1,0],health:{hp:0,max_hp:500,defeated:true,recovery_window_s:12,respawn_remaining_s:10,disabled_reason:'combat'}};
   await act(async()=>{social.setState({view:{profile:{id:'profile',name:'Mechanic'},worlds:[],alpha:{active:{world_id:1,team:'red',hero:'mechanic',mode:'quickplay'}}}});network.setState({connected:true,playerId:'mechanic',room_id:1,snapshot:{tick:10,entities:[actor,target]}});ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});combat.getState().setEnabled(false);root.render(h('div',null,h(GameController),h(Keyboard)));});await poll();
   const key=async(type,code)=>act(async()=>window.dispatchEvent(new window.KeyboardEvent(type,{code,bubbles:true,cancelable:true})));
   const reply=async()=>act(async()=>client.receiveSocialResult({request_id:sent.at(-1).request_id,ok:true,data:{revived:true,target:'ally',cooldown_s:20}}));
   await key('keydown','KeyU');assert.equal(sent.at(-1).action,'vehicle_revive');assert.equal(sent.at(-1).target,'ally');await reply();await key('keyup','KeyU');
   await press(4,true);assert.equal(sent.length,2);assert.equal(sent.at(-1).action,'vehicle_revive');assert.equal(input.getState().input.vehicleMask&VehicleFlags.BOOST,0);await reply();await press(4,false);
   await act(async()=>network.setState({snapshot:{tick:11,entities:[{...actor,health:{...actor.health,revive_cooldown_s:20}},target]}}));await press(4,true);assert.equal(sent.length,2,'cooldown blocks a new request');assert.equal(input.getState().input.vehicleMask&VehicleFlags.BOOST,0);await press(4,false);client.setSocialConnection(null);
  });
 }finally{if(root)await act(async()=>root.unmount());await vite?.close();dom.window.close();for(const[key,value]of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});
