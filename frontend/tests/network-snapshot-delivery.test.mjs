import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

test('socket snapshots coalesce without delaying ACKs, life transitions or leaking across worlds', async () => {
  const dom = new JSDOM('', {url:'http://localhost/', pretendToBeVisual:true});
  const originals = new Map();
  const frames = new Map();
  let nextFrame = 0, now = 100;
  dom.window.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  dom.window.cancelAnimationFrame = handle => frames.delete(handle);
  class FakeSocket {
    static OPEN=1; static CONNECTING=0;
    readyState=0; bufferedAmount=0; sent=[];
    close(){this.readyState=3;this.onclose?.();}
    open(){this.readyState=1;this.onopen?.();}
    receive(data){this.onmessage?.({data:JSON.stringify(data)});}
    send(data){this.sent.push(JSON.parse(data));}
  }
  for (const [key,value] of Object.entries({window:dom.window,document:dom.window.document,
    localStorage:dom.window.localStorage,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,
    CustomEvent:dom.window.CustomEvent,WebSocket:FakeSocket})) {
    originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  }
  const clock = Object.getOwnPropertyDescriptor(performance,'now');
  Object.defineProperty(performance,'now',{value:()=>now,configurable:true});
  const vite = await createServer({cacheDir:'node_modules/.vite-snapshot-delivery',
    optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  let transport, stop;
  const render = () => {
    now += 16;
    const ready = [...frames.values()]; frames.clear();
    for (const callback of ready) callback(now);
  };
  try {
    transport = await vite.ssrLoadModule('/src/net/rustSocket.ts');
    const {useNetworkStore:net} = await vite.ssrLoadModule('/src/store/session/networkStore.ts');
    const peer = transport.connectRustServer(); peer.open();
    peer.receive({type:'welcome',player_id:'self',room_id:4});
    peer.receive({type:'world_changed',world:{id:4,map:'harbor',team:'red'}});
    const body = {id:'self',vehicle_id:'brz',position:[0,0,0],rotation:[0,0,0,1],health:{defeated:false}};
    const send = (tick, entity=body, world_id=4) => {
      now += 1;
      peer.receive({type:'snapshot',world_id,data:{tick,entities:[entity]}});
      return now;
    };
    let publications = 0;
    stop = net.subscribe((state,previous)=>{if(state.snapshot!==previous.snapshot)publications++;});
    send(1);
    assert.equal(net.getState().tick,1);
    transport.recordInputPacketSent(7,now-8);
    send(2,{...body,last_input_seq:7});
    assert.equal(net.getState().tick,1,'movement waits for the next render');
    assert.equal(transport.getInputSenderStats().acknowledgedInputSeq,7,'input receipt ACK does not wait for UI work');
    assert.equal(transport.getInputSenderStats().inputAckMs,9);
    let latestArrival;
    for(let tick=3;tick<=60;tick++) latestArrival=send(tick);
    assert.equal(publications,1);
    assert.equal(frames.size,1);
    render();
    assert.equal(publications,2);
    assert.equal(net.getState().tick,60);
    assert.equal(net.getState().snapshot.received_at_ms,latestArrival,'keeps arrival clock, not flush clock');
    assert.equal(transport.getInputSenderStats().coalescedSnapshots,58);

    send(65); send(61); render();
    assert.equal(net.getState().tick,65,'pending tick order is guarded as well as displayed tick order');
    send(66);
    send(67,{...body,health:{defeated:true}});
    assert.equal(net.getState().tick,67,'death stops controls without waiting for a render');
    assert.equal(frames.size,0);
    send(68);
    assert.equal(net.getState().tick,68,'respawn starts controls without waiting for a render');

    send(69,{...body,vehicle_id:'hawaii_rescue'});
    assert.equal(net.getState().tick,69,'vehicle replacement is a lifecycle boundary');
    send(70);
    send(71);
    peer.receive({type:'snapshot',world_id:4,data:{tick:72,entities:[]}});
    assert.equal(net.getState().tick,72,'local body removal stops controls immediately');
    send(73);
    assert.equal(net.getState().tick,73,'a newly spawned local body is immediate');
    for(const [tick,phase] of [[74,'running'],[75,'ended']]) {
      peer.receive({type:'snapshot',world_id:4,data:{tick,entities:[body],match_state:{match_id:'round',phase}}});
      assert.equal(net.getState().tick,tick,'match boundaries are not lost when render frames stall');
    }
    send(76); // Clear the round before queuing ordinary motion.
    send(77);
    const staleWorldCallback = [...frames.values()][0];
    peer.receive({type:'world_changed',world:{id:5,map:'canal',team:'red'}});
    assert.equal(net.getState().snapshot,null);
    send(0,body,5); send(1,body,5);
    staleWorldCallback();
    assert.equal(net.getState().tick,0,'old-world callback cannot flush new-world data');
    render(); assert.equal(net.getState().tick,1);

    // The decoder must not accept an old world's keyframe and then reject valid
    // current-world deltas because their immutable baseline was overwritten.
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/compact-snapshot.json',import.meta.url),'utf8'));
    peer.receive({type:'world_changed',world:{id:fixture.keyframe.world_id,map:'fixture',team:'red'}});
    peer.receive(fixture.keyframe);
    const negotiations = () => peer.sent.filter(message=>message.type==='snapshot_format').length;
    const before = negotiations();
    peer.receive({...fixture.keyframe,world_id:999,base_id:999});
    peer.receive({...fixture.delta,world_id:999});
    peer.receive(fixture.delta);
    render();
    assert.equal(net.getState().tick,fixture.updated.data.tick);
    assert.equal(negotiations(),before,'unrelated worlds do not poison or resync the active decoder');

    peer.receive(fixture.return_delta);
    const staleCloseCallback = [...frames.values()][0];
    transport.disconnectRustServer();
    staleCloseCallback?.();
    render();
    assert.equal(net.getState().snapshot,null);
    assert.equal(net.getState().connected,false);
    assert.equal(frames.size,0);
  } finally {
    stop?.(); transport?.disconnectRustServer();
    if(clock)Object.defineProperty(performance,'now',clock);else delete performance.now;
    await vite.close();dom.window.close();
    for(const[key,value]of originals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
  }
});
