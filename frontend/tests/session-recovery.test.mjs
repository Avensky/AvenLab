import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
test('authenticated reconnect restores one deployed vehicle, rejects stale callbacks and cancels on leave',async()=>{
 const dom=new JSDOM('',{url:'http://localhost/',pretendToBeVisual:true}),old=new Map();let server,transport;
 for(const [k,v]of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,CustomEvent:dom.window.CustomEvent,HTMLElement:dom.window.HTMLElement,navigator:dom.window.navigator})){old.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});}
 const originalSocket=globalThis.WebSocket;
 class FakeSocket{static OPEN=1;static CONNECTING=0;readyState=0;bufferedAmount=0;sent=[];send(s){this.sent.push(JSON.parse(s));}close(){this.readyState=3;this.onclose?.();}receive(p){this.onmessage?.({data:JSON.stringify(p)});}open(){this.readyState=1;this.onopen?.();}}
 globalThis.WebSocket=FakeSocket;
 try{
 server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});const load=p=>server.ssrLoadModule('/src/'+p);
 transport=await load('net/rustSocket.ts');const{useUIStore:ui}=await load('store/menus/uiStore.ts'),{useNetworkStore:net}=await load('store/session/networkStore.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts');
 const view={profile:{id:'profile',name:'Driver'},players:[],teammates:[],requests:[],groups:[],worlds:[],world_invites:[],maps:['range'],limits:{max_active_worlds:10},current_world_id:4};
 const map={map_id:'range',chunks:[],visuals:[]};const entity={id:'old',vehicle_id:'tank',position:[0,1,0],rotation:[0,0,0,1]};
 const first=transport.connectRustServer();first.open();ui.setState({screen:'sandbox'});net.setState({playerId:'old',room_id:4,worldMap:'range'});net.getState().setSnapshot({tick:100,entities:[entity]},performance.now());social.setState({view});
 first.close();const second=transport.connectRustServer();second.open();second.receive({type:'welcome',player_id:'new'});second.receive({type:'world_changed',world:{id:4,map:'range'}});second.receive({type:'map_snapshot',data:map});assert.equal(second.sent.filter(x=>x.type==='spawn_request').length,0,'wait for authentication');
 second.receive({type:'social_state',data:view});second.receive({type:'social_state',data:view});second.receive({type:'map_snapshot',data:map});assert.equal(second.sent.filter(x=>x.type==='spawn_request').length,1);assert.equal(second.sent.find(x=>x.type==='spawn_request').vehicle,'tank');
 first.receive({type:'world_changed',world:{id:99,map:'wrong'}});assert.equal(net.getState().room_id,4);
 second.receive({type:'snapshot',world_id:4,data:{tick:1,entities:[{...entity,id:'new'}]}});assert(net.getState().getMe());
 second.close();ui.getState().setScreen('main');const third=transport.connectRustServer();third.open();third.receive({type:'social_state',data:view});third.receive({type:'map_snapshot',data:map});assert.equal(third.sent.filter(x=>x.type==='spawn_request').length,0,'navigation cancels deployment');
 const {usePreferencesStore:prefs}=await load('store/preferences/preferencesStore.ts'),{aimCombat,combatIntent,useCombatStore:combat}=await load('combat/combatStore.ts');combat.getState().setEnabled(true);combatIntent.orientationLocked=false;combatIntent.yaw=0;combatIntent.pitch=0;prefs.getState().update({turretYawSensitivity:2,turretPitchSensitivity:0.5});aimCombat(.1,.1);assert(Math.abs(combatIntent.yaw+.2)<1e-6);assert(Math.abs(combatIntent.pitch+.05)<1e-6);prefs.getState().update({turretYawSensitivity:999,turretPitchSensitivity:NaN});assert.equal(prefs.getState().turretYawSensitivity,3);assert(Number.isFinite(prefs.getState().turretPitchSensitivity));
 }finally{transport?.disconnectRustServer();await server?.close();dom.window.close();globalThis.WebSocket=originalSocket;for(const[k,d]of old){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});
