import assert from 'node:assert/strict';
import test from 'node:test';
import {act, createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

test('combat feedback deduplicates, expires, and clears between rooms without opening chat', async () => {
  const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost'});
  for (const key of ['window','document','localStorage','HTMLElement']) globalThis[key] = dom.window[key];
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const vite = await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  const load = name => vite.ssrLoadModule('/src/' + name);
  const root = createRoot(document.getElementById('root'));
  try {
    const {CombatNotices} = await load('combat/CombatNotices.tsx');
    const {useCombatNotices,announceCombat} = await load('combat/combatNoticeStore.ts');
    const {useUIStore} = await load('store/menus/uiStore.ts');
    const {useNetworkStore: network} = await load('store/session/networkStore.ts');
    const {useChatStore: chat} = await load('store/chat/chatStore.ts');
    const {ResourceFlags} = await load('store/telemetry/resourceMasks.ts');
    const me = {id:'me',vehicle_id:'camaro',room_id:1,vehicle_mask:0,resource_mask:0,
      health:{stats:{damage_dealt:40}}};
    const frame = entity => network.setState({connected:true,playerId:'me',room_id:entity.room_id,snapshot:{entities:[entity]}});
    useUIStore.setState({screen:'sandbox',overlay:null,isModeLoading:false});
    frame(me);
    await act(async () => root.render(createElement(CombatNotices)));
    assert.equal(document.querySelector('.combat-notices').children.length,0);
    await act(async () => {
      frame({...me,resource_mask:ResourceFlags.HOT});
      announceCombat('Engine hot'); announceCombat('Engine hot');
    });
    assert.equal(document.querySelector('.combat-notices').textContent,'Engine hot');
    await act(async () => {
      frame({...me,resource_mask:ResourceFlags.HOT, health:{stats:{damage_dealt:50}}});
      frame({...me,resource_mask:ResourceFlags.HOT, health:{stats:{damage_dealt:58}}});
      await new Promise(done => setTimeout(done,340));
    });
    assert.equal(useCombatNotices.getState().lines.at(-1).text,'18 damage');
    await act(async () => frame({...me,room_id:2}));
    assert.equal(useCombatNotices.getState().lines.length,0);
    await act(async () => announceCombat('Low fuel'));
    await act(async () => new Promise(done => setTimeout(done,2000)));
    assert.equal(document.querySelector('.combat-notices').children.length,0);
    assert.equal(chat.getState().notices.length,0);
  } finally {
    await act(async () => root.unmount());
    await vite.close();
    dom.window.close();
  }
});
