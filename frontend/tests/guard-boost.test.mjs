import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';

test('BRZ guarded boost uses confirmed hero, resources, cooldown and shield state',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true}),original=new Map();
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,localStorage:dom.window.localStorage,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true})){
  original.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.hasFocus=()=>true;
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}}),load=path=>vite.ssrLoadModule('/src/'+path),root=createRoot(document.getElementById('root'));let client;
 try{
  const {useNetworkStore:network}=await load('store/session/networkStore.ts'),{useSocialStore:social}=await load('store/social/socialStore.ts'),{useUIStore:ui}=await load('store/menus/uiStore.ts'),{useChatStore:chat}=await load('store/chat/chatStore.ts');
  const actions=await load('combat/guardBoost.ts'),{GuardBoostAction}=await load('combat/GuardBoostAction.tsx'),{TankBarrierAction}=await load('combat/TankBarrierAction.tsx'),{readEffectSignals:read,activeVehicleEffects:effects}=await load('combat/activeEffects.ts'),{sampleGuardBreak:flash,guardShieldTransform,GUARD_ARC_HALF_ANGLE}=await load('combat/guardShieldVisual.ts');
  client=await load('net/socialClient.ts');const sent=[];client.setSocialConnection({readyState:WebSocket.OPEN,send:body=>sent.push(JSON.parse(body))});
  const guard={remaining_s:0,cooldown_s:0,shield_hp:0,shield_max_hp:200,break_seq:0};
  const me={id:'me',kind:'vehicle',vehicle_id:'brz',team:'blue',room_id:3,position:[0,1,0],rotation:[0,0,0,1],speed:0,gear:1,fuel:20,vehicle_mask:1,player_mask:0,guard,health:{hp:500,max_hp:500,defeated:false},wheels:[{grounded:true},{grounded:true},{grounded:true},{grounded:true}]};
  const stage=(hero='brz',world=3,profile='driver',patch={})=>{network.setState({connected:true,playerId:'me',room_id:world,snapshot:{tick:1,received_at_ms:performance.now(),entities:[{...me,room_id:world,...patch}]}});social.setState({view:{profile:{id:profile,name:'Driver'},alpha:{active:{hero,world_id:world,team:'blue'}},worlds:[]}});ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});};stage();
  await t.test('a shared BRZ chassis cannot grant another hero a guard',()=>{
   assert(actions.isGuardDpsPlayer());stage('mechanic');assert.equal(actions.isGuardDpsPlayer(),false);stage('brz',3,'driver',{vehicle_id:'tank'});assert.equal(actions.isGuardDpsPlayer(),false);stage();network.setState({room_id:9});assert.equal(actions.isGuardDpsPlayer(),false);stage();
  });
  await t.test('unavailable, disabled, wrong-gear and unsupported resource states never look ready',()=>{
   assert.equal(actions.guardBoostBlockReason(me),'');
   for(const [patch,expected]of [[{guard:undefined},'SERVER UPDATE REQUIRED'],[{guard:{...guard,cooldown_s:NaN}},'SERVER UPDATE REQUIRED'],[{vehicle_mask:0},'START ENGINE'],[{gear:0},'SELECT DRIVE'],[{fuel:2.99},'LOW FUEL'],[{wheels:[{grounded:true},{grounded:false}]},'GROUND WHEELS'],[{health:{hp:0,defeated:true}},'VEHICLE DISABLED'],[{guard:{...guard,cooldown_s:5}},'COOLDOWN']])assert.equal(actions.guardBoostBlockReason({...me,...patch}),expected);
   assert.equal(actions.readGuardBoost({...me,guard:{...guard,shield_hp:201}}),null);assert.equal(actions.readGuardBoost({...me,guard:{...guard,break_seq:Infinity}}),null);
  });
  await t.test('button sends one action without authoring shield values and displays authoritative cooldown and break state',async()=>{
   stage();await act(async()=>root.render(h(GuardBoostAction)));const button=document.querySelector('[aria-label="Guard boost"]');assert(button&&!button.disabled);let pending;
   await act(async()=>{pending=actions.requestGuardBoost();});assert.equal(sent.at(-1).action,'dps_guard_boost');assert.equal(Object.hasOwn(sent.at(-1),'shield_hp'),false);assert(button.disabled);assert.equal(await actions.requestGuardBoost(),false);
   await act(async()=>client.receiveSocialResult({request_id:sent.at(-1).request_id,ok:true,data:{}}));assert.equal(await pending,true);assert.equal(network.getState().getMe().guard.remaining_s,0,'no optimistic shield or HP mutation');
   await act(async()=>stage('brz',3,'driver',{guard:{...guard,remaining_s:3,cooldown_s:10,shield_hp:175}}));assert(button.disabled);assert.equal(button.dataset.active,'true');assert.match(button.textContent,/SHIELD 175 HP/);assert.equal(button.querySelector('.cooldown-clock').dataset.progress,'0.75','active boost drains over four seconds');
   await act(async()=>stage('brz',3,'driver',{guard:{...guard,remaining_s:2,cooldown_s:9,shield_hp:0,break_seq:1}}));assert.match(button.textContent,/STABILITY/);assert.equal(await actions.requestGuardBoost(),false);
   await act(async()=>stage('mechanic'));assert.equal(document.querySelector('[aria-label="Guard boost"]'),null);
  });
  await t.test('a late response cannot clear a different world request or notify a new actor',async()=>{
   await act(async()=>{stage();chat.setState({notices:[]});});let first,second;await act(async()=>{first=actions.requestGuardBoost();});const old=sent.at(-1);
   await act(async()=>stage('brz',4,'new-driver'));await act(async()=>{second=actions.requestGuardBoost();});const current=sent.at(-1);
   await act(async()=>client.receiveSocialResult({request_id:old.request_id,ok:false,message:'old error'}));assert.equal(await first,false);assert.equal(chat.getState().notices.length,0);assert.equal(actions.useGuardBoostRequestStore.getState().busy,true);
   await act(async()=>client.receiveSocialResult({request_id:current.request_id,ok:true,data:{}}));assert.equal(await second,true);assert.equal(actions.useGuardBoostRequestStore.getState().busy,false);
   await act(async()=>ui.setState({overlay:'pause'}));assert.equal(await actions.requestGuardBoost(),false);
  });
  await t.test('front shield and stability are separate confirmed buffs; shield break does not erase remaining stability',()=>{
   const running={...guard,remaining_s:2.24,cooldown_s:18,shield_hp:90};const buffs=effects(read({...me,guard:running,telemetry_mask:16,vehicle_mask:129}));assert.deepEqual(buffs.map(buff=>buff.id),['front-guard','guard-stability']);assert.equal(buffs[0].remaining,2.3);assert.match(buffs[0].description,/90 shield HP/);
   assert.deepEqual(effects(read({...me,guard:{...running,shield_hp:0}})).map(buff=>buff.id),['guard-stability']);
   assert.deepEqual(effects(read({...me,guard:{...running,remaining_s:0}})),[]);assert.deepEqual(effects(read({...me,health:{defeated:true},guard:running})),[]);assert.deepEqual(effects(read({...me,guard:{...running,remaining_s:Infinity}})),[]);
  });
  await t.test('Tank barrier is a separate role-locked team shield without DPS movement or nitrous requirements',async()=>{
   const tankGuard={...guard,kind:'tank_barrier',shield_max_hp:500};
   await act(async()=>stage('tank',3,'tank-driver',{vehicle_id:'tank',fuel:1,gear:0,boost_fraction:0,wheels:[],guard:tankGuard}));
   assert.equal(actions.isGuardDpsPlayer(),false);assert.equal(actions.isTankBarrierPlayer(),true);assert.equal(await actions.requestGuardBoost(),false);
   assert.equal(actions.tankBarrierBlockReason(network.getState().getMe()),'','a running stationary tank needs fuel, not DPS gear/NOS/grounded gates');
   await act(async()=>root.render(h(TankBarrierAction)));const button=document.querySelector('[aria-label="Tank barrier"]');assert(button&&!button.disabled);let pending;
   await act(async()=>{pending=actions.requestTankBarrier();});assert.equal(sent.at(-1).action,'tank_barrier');assert.equal(Object.hasOwn(sent.at(-1),'shield_hp'),false);assert.equal(button.disabled,true);
   await act(async()=>client.receiveSocialResult({request_id:sent.at(-1).request_id,ok:true,data:{}}));assert.equal(await pending,true);
   await act(async()=>stage('tank',3,'tank-driver',{vehicle_id:'tank',guard:{...tankGuard,remaining_s:0,cooldown_s:7.5,shield_hp:420}}));
   assert.match(button.textContent,/BARRIER 420 HP/);assert.equal(button.querySelector('.cooldown-clock').dataset.progress,'0.84','active barrier shows surviving shield');
   const tankBuffs=effects(read(network.getState().getMe()));assert.deepEqual(tankBuffs.map(buff=>buff.id),['tank-barrier']);assert.equal(tankBuffs[0].duration,null);assert.equal(tankBuffs[0].nature,'defense');
   await act(async()=>stage('tank',3,'tank-driver',{vehicle_id:'tank',guard:{...tankGuard,shield_hp:0,cooldown_s:7.5}}));
   assert.equal(button.querySelector('.cooldown-clock').dataset.progress,'0.5','broken barrier refills over its cooldown');
   await act(async()=>stage('brz'));assert.equal(document.querySelector('[aria-label="Tank barrier"]'),null);assert.equal(await actions.requestTankBarrier(),false);
  });
  await t.test('confirmed breaks pulse once and initial/reconnected snapshots do not replay an old break',()=>{
   const state={sequence:null,at:-Infinity};assert.equal(flash(state,4,10),0);assert.equal(flash(state,5,11),1);assert(flash(state,5,11.1)>0);assert.equal(flash(state,5,11.4),0);assert.equal(flash({sequence:null,at:-Infinity},5,12),0);assert.equal(flash(state,NaN,12),0);
   assert.equal(flash(state,6,13),1);assert.equal(flash(state,0,13.1),0,'a round reset clears an old break');assert.equal(flash(state,1,14),1);assert.equal(flash(state,1,0),0,'clock reset cannot replay the old pulse');
  });
  await t.test('the complete BRZ and Tank shield arcs clear their front bumpers and cover collider height and width',()=>{
   for(const half of [[1,.5,2],[1.8,.8,3.2]])for(const offset of [[0,0,0],[.3,-.2,.7]]){
    const transform=guardShieldTransform({chassis_half_extents:half,chassis_offset:offset}),bumper=offset[2]+half[2];
    assert.equal(transform.x,offset[0]);assert.equal(transform.y,offset[1]);
    assert(transform.y-transform.height/2<offset[1]-half[1]);assert(transform.y+transform.height/2>offset[1]+half[1]);
    for(let sample=0;sample<=120;sample++){
     const theta=-GUARD_ARC_HALF_ANGLE+2*GUARD_ARC_HALF_ANGLE*sample/120;
     assert(transform.z+Math.cos(theta)*transform.depthRadius>bumper,'every point of the front arc must be outside the hull');
    }
    assert(transform.widthRadius*Math.sin(GUARD_ARC_HALF_ANGLE)>half[0],'arc endpoints extend past both hull sides');
   }
  });
 }finally{await act(async()=>{client?.setSocialConnection(null);root.unmount();});await vite.close();dom.window.close();for(const[key,value]of original){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
