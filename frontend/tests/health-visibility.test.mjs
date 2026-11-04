import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {createServer} from 'vite';import {createElement as h,act} from 'react';import {createRoot} from 'react-dom/client';
test('saved health visibility, keyboard cycling and defeat feedback share one policy',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),original=new Map();let root,server,tick=0;
 for(const[k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){original.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}
 document.hasFocus=()=>true;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
 try{
  server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});const load=p=>server.ssrLoadModule('/src/'+p);
  const policy=await load('store/preferences/healthVisibility.ts'),{usePreferencesStore:prefs,sanitizePreferences,DEFAULT_PREFERENCES}=await load('store/preferences/preferencesStore.ts'),{sanitizeBindings,DEFAULT_BINDINGS}=await load('store/preferences/keyBindings.ts');
  const {useNetworkStore:network}=await load('store/session/networkStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),{useCanDataStore:can}=await load('store/recon/canDataStore.ts'),{useVehicleTelemetryStore:telemetry}=await load('store/telemetry/vehicleTelemetryStore.ts'),{useChatStore:chat}=await load('store/chat/chatStore.ts');
  const {Keyboard}=await load('controls/Keyboard.ts'),{VehicleHealthHUD}=await load('combat/VehicleHealthHUD.tsx'),{SettingsMenu}=await load('game/menus/SettingsMenu.tsx');
  const entity={id:'me',kind:'vehicle',vehicle_id:'tank',room_id:2,team:'red',position:[0,1,0],rotation:[0,0,0,1],vehicle_mask:1,player_mask:0,health:{hp:1200,max_hp:1200,defeated:false,respawn_remaining_s:0,spawn_protection_s:0,damage_seq:1,last_attacker:null,last_damage:0,last_damage_kind:'',kills:0,deaths:0}};
  const send=()=>{network.getState().setSnapshot({tick:++tick,entities:[{...entity,health:{...entity.health}}]},performance.now());telemetry.setState(s=>({data:{...s.data,signal:'live'}}));};
  const press=(code,options={},target=window)=>act(async()=>{target.dispatchEvent(new window.KeyboardEvent('keydown',{code,bubbles:true,cancelable:true,...options}));target.dispatchEvent(new window.KeyboardEvent('keyup',{code,bubbles:true,cancelable:true,...options}));});
  const setMode=mode=>act(async()=>{prefs.getState().update({healthBars:mode});send();});
  ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});network.setState({playerId:'me',connected:true});send();root=createRoot(document.getElementById('root'));await act(async()=>root.render(h('div',{className:'driving-hud'},h(Keyboard),h(VehicleHealthHUD))));
  await t.test('five modes filter self and both teams and reject unknown teams in team filters',()=>{
   for(const[mode,wanted]of Object.entries({all:[true,true,true,true],red:[true,true,false,false],blue:[false,false,true,false],none:[false,false,false,false],others:[false,true,true,true]}))assert.deepEqual([[true,'red'],[false,'RED'],[false,'blue'],[false,undefined]].map(([self,team])=>policy.showVehicleHealthBar(mode,team,self)),wanted,mode);
   assert.equal(policy.sanitizeHealthBarMode('corrupt'),'all');assert.equal(sanitizePreferences({healthBars:'corrupt'}).healthBars,'all');assert.equal(DEFAULT_PREFERENCES.healthBars,'all');assert.deepEqual(policy.HEALTH_BAR_MODES.map(mode=>policy.cycleHealthBarMode(mode)),['red','blue','none','others','all']);
  });
  await t.test('legacy control saves add a collision-free key and display choice survives persistence',async()=>{
   const collision=sanitizeBindings({...DEFAULT_BINDINGS,forward:'KeyJ'});assert.equal(collision.forward,'KeyJ');assert.notEqual(collision.healthBars,'KeyJ');assert.equal(new Set(Object.values(collision)).size,Object.keys(DEFAULT_BINDINGS).length);
   await setMode('others');assert.equal(document.querySelector('.vehicle-health-hud'),null);assert.equal(JSON.parse(localStorage.getItem('avenlab-preferences-v1')).state.healthBars,'others');
   const saved=localStorage.getItem('avenlab-preferences-v1');await act(async()=>{prefs.setState({healthBars:'all'});localStorage.setItem('avenlab-preferences-v1',saved);await prefs.persist.rehydrate();});assert.equal(prefs.getState().healthBars,'others');
   await setMode('red');assert(document.querySelector('.vehicle-health-hud'));await setMode('blue');assert.equal(document.querySelector('.vehicle-health-hud'),null);
  });
  await t.test('nonrepeating gameplay key cycles five modes and uses the saved binding',async()=>{
   await setMode('all');for(const expected of ['red','blue','none','others','all']){send();await press('KeyJ');assert.equal(prefs.getState().healthBars,expected);}assert.match(chat.getState().notices.at(-1).text,/Health bars: Show all/);
   await press('KeyJ',{repeat:true});assert.equal(prefs.getState().healthBars,'all');await act(async()=>prefs.getState().update({bindings:{...DEFAULT_BINDINGS,healthBars:'KeyK'}}));send();await press('KeyJ');assert.equal(prefs.getState().healthBars,'all');send();await press('KeyK');assert.equal(prefs.getState().healthBars,'red');
  });
  await t.test('hotkey ignores text, menus, terminal, modifiers and stale or disconnected sessions',async()=>{
   await setMode('all');const typing=document.createElement('input');document.body.append(typing);await press('KeyK',{},typing);assert.equal(prefs.getState().healthBars,'all');typing.remove();
   await act(async()=>ui.setState({overlay:'pause'}));await press('KeyK');assert.equal(prefs.getState().healthBars,'all');await act(async()=>ui.setState({overlay:null,screen:'main'}));await press('KeyK');assert.equal(prefs.getState().healthBars,'all');await act(async()=>ui.setState({screen:'sandbox'}));
   can.setState({commandOpen:true});await press('KeyK');assert.equal(prefs.getState().healthBars,'all');can.setState({commandOpen:false});
   for(const modifier of ['shiftKey','altKey','ctrlKey','metaKey']){send();await press('KeyK',{[modifier]:true});assert.equal(prefs.getState().healthBars,'all');}
   network.setState(s=>({snapshot:{...s.snapshot,received_at_ms:performance.now()-2000}}));await press('KeyK');assert.equal(prefs.getState().healthBars,'all');network.setState({connected:false});await press('KeyK');assert.equal(prefs.getState().healthBars,'all');await act(async()=>{network.setState({connected:true});send();});
  });
  await t.test('hidden HP preserves damage feedback and countdown and hotkey works while defeated',async()=>{
   await setMode('none');entity.health={...entity.health,hp:0,defeated:true,respawn_remaining_s:3.2,damage_seq:2,last_damage:1200};await act(async()=>send());assert.equal(document.querySelector('.vehicle-health-hud'),null);assert.match(document.querySelector('.vehicle-defeated-banner').textContent,/RESPAWN IN 3.2s/);assert(document.querySelector('.vehicle-damage-flash'));
   await setMode('others');assert.equal(document.querySelector('.vehicle-health-hud'),null);assert(document.querySelector('.vehicle-defeated-banner'));send();await press('KeyK');assert.equal(prefs.getState().healthBars,'all');assert(document.querySelector('.vehicle-health-hud'));
  });
  await t.test('settings expose health policy, restore HUD defaults and capture a new key',async()=>{
   await act(async()=>ui.setState({overlay:'settings',settingsTab:'hud'}));await act(async()=>root.render(h(SettingsMenu)));
   const row=()=>[...document.querySelectorAll('button')].find(node=>node.querySelector('.menu-row-label')?.textContent==='Health bars');assert(row());await act(async()=>row().click());assert.equal(prefs.getState().healthBars,'red');
   const restore=[...document.querySelectorAll('button')].find(node=>node.textContent.includes('Restore all HUD groups'));assert(restore);await act(async()=>restore.click());assert.equal(prefs.getState().healthBars,'all');
   const keyboard=[...document.querySelectorAll('[role="tab"]')].find(node=>node.textContent.includes('Keyboard'));assert(keyboard);await act(async()=>keyboard.click());const bind=[...document.querySelectorAll('button')].find(node=>node.querySelector('.menu-row-label')?.textContent==='Cycle health bars');assert(bind);await act(async()=>bind.click());await press('KeyK');assert.equal(prefs.getState().bindings.healthBars,'KeyK');
  });
 }finally{if(root)await act(async()=>root.unmount());await server?.close();dom.window.close();for(const[k,v]of original){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
});
