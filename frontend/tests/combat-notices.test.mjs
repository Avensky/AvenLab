import assert from 'node:assert/strict';
import test from 'node:test';
import {act, createElement as h, Profiler} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

test('one transient notification lane stays fresh, bounded and separate from chat and bottom instruments', async t => {
  const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost',pretendToBeVisual:true}),original=new Map();
  for (const [key,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})) {
    original.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  }
  Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
  const vite = await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  const load = name => vite.ssrLoadModule('/src/' + name);
  const root = createRoot(document.getElementById('root'));
  try {
    const {CombatNotices} = await load('combat/CombatNotices.tsx');
    const {useCombatNotices,announceCombat,clearCombatNotices,captureNoticeEvent} = await load('combat/combatNoticeStore.ts');
    const {ActiveEffectsBar} = await load('combat/ActiveEffectsBar.tsx');
    const {useUIStore} = await load('store/menus/uiStore.ts');
    const {useNetworkStore: network} = await load('store/session/networkStore.ts');
    const {useChatStore: chat} = await load('store/chat/chatStore.ts');
    const {usePreferencesStore:prefs} = await load('store/preferences/preferencesStore.ts');
    const {updateVehicleTelemetry:sampleTelemetry,HUD_STALE_MS} = await load('store/telemetry/vehicleTelemetryStore.ts');
    const {ResourceFlags} = await load('store/telemetry/resourceMasks.ts');
    const {VehicleFlags} = await load('store/input/protocol/inputMasks.ts');
    let me = {id:'me',vehicle_id:'camaro',room_id:1,vehicle_mask:0,resource_mask:0,telemetry_mask:127,position:[0,1,0],rotation:[0,0,0,1],
      health:{hp:500,max_hp:500,defeated:false,spawn_protection_s:0,stats:{damage_dealt:40}}},tick=0,commits=0;
    const frame = (patch={},received=performance.now()) => {
      me={...me,...patch};network.setState({connected:true,playerId:'me',room_id:me.room_id});
      network.getState().setSnapshot({tick:++tick,entities:[me]},received);sampleTelemetry();
    };
    const lines=()=>useCombatNotices.getState().lines;
    const hud=()=>h('div',{className:'driving-hud'},h(Profiler,{id:'notices',onRender:()=>commits++},h(CombatNotices)),h(ActiveEffectsBar));
    useUIStore.setState({screen:'sandbox',overlay:null,isModeLoading:false});
    frame();
    await act(async () => root.render(hud()));
    assert.equal(document.querySelector('.combat-notices').children.length,0);
    await t.test('confirmed edges deduplicate and damage coalesces without chat',async()=>{
      await act(async () => {
        frame({resource_mask:ResourceFlags.HOT});
        announceCombat('Engine hot'); announceCombat('Engine hot');
      });
      assert.equal(document.querySelector('.combat-notices').textContent,'Engine hot');
      await act(async () => {
        frame({health:{...me.health,stats:{damage_dealt:50}}});
        frame({health:{...me.health,stats:{damage_dealt:58}}});
        await new Promise(done => setTimeout(done,300));
      });
      assert.equal(lines().at(-1).text,'18 DAMAGE');
      assert.equal(chat.getState().notices.length,0);
      const stable=commits;
      for(let i=0;i<20;i++)await act(()=>frame({position:[i,1,0]}));
      assert.equal(commits,stable,'pose-only snapshots never redraw the notice lane');
    });
    await t.test('world changes and pause epochs invalidate queued damage and late async replies',async()=>{
      const old=captureNoticeEvent();assert(old);
      await act(()=>{
        frame({health:{...me.health,stats:{damage_dealt:65}}});
        frame({room_id:2});
      });
      assert.equal(lines().length,0);
      await act(async()=>{announceCombat('Old-world failure','warning',old);await new Promise(done=>setTimeout(done,280));});
      assert.equal(lines().length,0);
      const beforePause=captureNoticeEvent();assert(beforePause);
      await act(()=>useUIStore.setState({overlay:'pause'}));
      await act(()=>{frame();useUIStore.setState({overlay:null});announceCombat('Old pause request','warning',beforePause);});
      assert.equal(lines().length,0);
      const current=captureNoticeEvent();assert(current);
      await act(()=>announceCombat('Late stalled response','warning',{...current,at:performance.now()-1200}));
      assert.equal(lines().length,0,'requests older than the freshness window cannot replay');
    });
    await t.test('hidden-tab changes baseline on resume, never replaying old death or protection',async()=>{
      await act(()=>announceCombat('Visible warning'));
      const old=captureNoticeEvent();assert(old);
      await act(()=>{
        Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new window.Event('visibilitychange'));
        frame({health:{...me.health,defeated:true,stats:{damage_dealt:90}}});
        frame({health:{...me.health,defeated:false,spawn_protection_s:2,stats:{damage_dealt:110}}});
        announceCombat('Hidden request','warning',old);
      });
      assert.equal(lines().length,0);
      await act(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new window.Event('visibilitychange'));});
      assert.equal(lines().length,0);
      assert.equal(document.querySelector('.combat-notices').textContent,'');
    });
    await t.test('defeat and spawn protection flash once, while badge explanations use the same top lane',async()=>{
      await act(()=>frame({health:{...me.health,defeated:true,spawn_protection_s:0}}));
      assert.equal(lines().at(-1).text,'VEHICLE DISABLED');assert.equal(lines().at(-1).tone,'debuff');
      await act(()=>{clearCombatNotices();frame({health:{...me.health,defeated:false,spawn_protection_s:2}});});
      assert.equal(lines().at(-1).text,'VEHICLE READY · SPAWN PROTECTION ACTIVE');assert.equal(lines().at(-1).tone,'buff');
      const id=lines().at(-1).id;
      await act(()=>frame({health:{...me.health,spawn_protection_s:1.7}}));
      assert.equal(lines().length,1);assert.equal(lines().at(-1).id,id,'shield countdown does not reset the flash');
      const badge=document.querySelector('.active-effect-button');assert(badge);
      await act(()=>{badge.dispatchEvent(new window.MouseEvent('pointerover',{bubbles:true}));badge.focus();});
      assert.equal(document.querySelector('[role="tooltip"]'),null,'no bottom hover/focus prose');
      await act(()=>badge.click());
      assert.match(lines().at(-1).text,/SPAWN SHIELD · BUFF/);
      assert.equal(document.querySelector('.active-effect-description'),null);
      assert.equal(document.querySelector('.active-effects').textContent,'','badges contain icons, not persistent prose');
    });
    await t.test('category toggles discard existing lines and cannot replay muted combat',async()=>{
      await act(()=>{clearCombatNotices();frame({health:{...me.health,spawn_protection_s:0},vehicle_mask:VehicleFlags.BOOST,resource_mask:0});});
      assert.match(lines().at(-1).text,/NITROUS/);assert.equal(lines().at(-1).tone,'buff');
      await act(()=>prefs.getState().update({notificationChannels:{effects:false}}));
      assert.equal(lines().length,0);
      await act(()=>{frame({vehicle_mask:0});frame({vehicle_mask:VehicleFlags.BOOST});});
      assert.equal(lines().length,0);
      await act(()=>prefs.getState().update({notificationChannels:{effects:true}}));
      assert.equal(lines().length,0,'unmuting does not replay previously suppressed effects');
    });
    await t.test('a replaced HUD owner cannot accept a pending reply from the prior mount',async()=>{
      await act(()=>frame());const old=captureNoticeEvent();assert(old);
      await act(()=>root.render(null));
      await act(()=>root.render(hud()));
      await act(()=>announceCombat('Old mounted HUD response','warning',old));
      assert.equal(lines().length,0);
    });
    await t.test('stale packets cannot generate combat and disconnected feedback is temporary',async()=>{
      await act(()=>{clearCombatNotices();frame({health:{...me.health,defeated:true,stats:{damage_dealt:200}}},performance.now()-HUD_STALE_MS-50);});
      assert(!lines().some(line=>line.text.includes('DISABLED')||line.channel==='combat'));
      await act(()=>{clearCombatNotices();frame({health:{...me.health,defeated:false,spawn_protection_s:2}});});
      assert.equal(lines().length,0,'freshness recovery establishes a baseline, not an old protection flash');
      await act(()=>{network.setState({connected:false});sampleTelemetry();});
      assert.equal(lines().at(-1)?.text,'CONNECTION LOST');
      await act(async()=>new Promise(done=>setTimeout(done,1700)));
      assert.equal(lines().length,0,'store-owned expiry works even when packets stop');
      assert.equal(document.querySelector('.combat-notices').children.length,0);
      await act(()=>announceCombat('Another connection warning','warning',captureNoticeEvent(true)));
      assert.equal(lines().length,1);
      await act(()=>useUIStore.setState({overlay:'pause'}));
      await act(()=>useUIStore.setState({overlay:null}));
      assert.equal(lines().length,0,'paused disconnected notices cannot reappear on return');
    });
  } finally {
    await act(async () => root.unmount());
    await vite.close();
    dom.window.close();
    for(const [key,value] of original){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
  }
});
