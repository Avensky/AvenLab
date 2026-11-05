import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

test('unfinished connections and silent menu sockets recover once; healthy and background peers remain connected', async t => {
  const dom = new JSDOM('', {url:'http://localhost/', pretendToBeVisual:true}), original = new Map();
  for (const [key,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,CustomEvent:dom.window.CustomEvent})) {
    original.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  }
  const previousSocket = globalThis.WebSocket, sockets = [];
  class FakeSocket {
    static OPEN=1; static CONNECTING=0;
    readyState=0; bufferedAmount=0; sent=[];
    constructor(){sockets.push(this);}
    close(){this.readyState=3;this.onclose?.();}
    open(){this.readyState=1;this.onopen?.();}
    receive(data){this.onmessage?.({data:JSON.stringify(data)});}
    send(data){this.sent.push(JSON.parse(data));}
  }
  globalThis.WebSocket = FakeSocket;
  const vite = await createServer({cacheDir:'node_modules/.vite-liveness', server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  let transport, now=0;
  const clock = Object.getOwnPropertyDescriptor(performance,'now');
  try {
    transport = await vite.ssrLoadModule('/src/net/rustSocket.ts');
    t.mock.timers.enable({apis:['setTimeout','setInterval']});
    Object.defineProperty(performance,'now',{value:()=>now,configurable:true});
    const advance = seconds => {for(let i=0;i<seconds;i++){now+=1000;t.mock.timers.tick(1000);}};
    const first = transport.connectRustServer();
    assert.equal(transport.connectRustServer(),first);
    advance(15); assert.equal(first.readyState,3,'CONNECTING cannot monopolize the socket owner forever');
    advance(3); assert.equal(sockets.length,2,'only one replacement attempt');
    const second = transport.connectRustServer(); second.open();
    advance(15); assert.equal(second.readyState,3,'open without welcome also expires');
    advance(3);
    const third = transport.connectRustServer(); third.open(); third.receive({type:'welcome',player_id:'menu'});
    advance(20); assert.equal(third.readyState,3,'silent menus recover without a physics body');
    advance(3);
    const healthy = transport.connectRustServer(); healthy.open(); healthy.receive({type:'welcome',player_id:'healthy',compact_snapshot_version:1});
    assert(healthy.sent.some(m=>m.type==='snapshot_format'&&m.version===1),'new peers negotiate compact snapshots');
    assert(!third.sent.some(m=>m.type==='snapshot_format'),'legacy welcomes keep JSON');
    for(let i=0;i<8;i++){advance(5);healthy.receive({type:'pong'});}
    assert.equal(healthy.readyState,1,'ordinary menu heartbeats survive');
    first.onclose?.(); assert.equal(transport.connectRustServer(),healthy,'stale callbacks cannot clear the live socket');
    Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});
    advance(30); assert.equal(healthy.readyState,1,'background throttling does not trigger the visible-tab watchdog');
    Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
    document.dispatchEvent(new dom.window.Event('visibilitychange'));
    healthy.receive({type:'pong'}); advance(3); assert.equal(healthy.readyState,1);
    const sender=await vite.ssrLoadModule('/src/net/inputSender.ts');
    const {useUIStore}=await vite.ssrLoadModule('/src/store/menus/uiStore.ts');
    sender.startInputSender();
    assert.equal(transport.inputSenderDiagnostics.running,false);
    advance(1);assert(!healthy.sent.some(m=>m.type==='input'),'menus send no vehicle inputs');
    try {
      healthy.receive({type:'world_changed',world:{id:12,team:'blue'}});
      useUIStore.setState({screen:'sandbox',overlay:null,isModeLoading:false});
      const body={id:'healthy',vehicle_id:'brz',position:[0,0,0],rotation:[0,0,0,1],health:{defeated:false}};
      const frame=(tick,entity)=>healthy.receive({type:'snapshot',world_id:12,data:{tick,entities:[entity]}});
      frame(1,body);
      assert.equal(transport.inputSenderDiagnostics.running,true);
      sender.sendInputPacket();assert(healthy.sent.some(m=>m.type==='input'));
      Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});
      document.dispatchEvent(new dom.window.Event('visibilitychange'));
      assert.equal(transport.inputSenderDiagnostics.running,false);
      assert.equal(healthy.sent.at(-1).type,'input');assert.equal(healthy.sent.at(-1).throttle,0);
      Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
      document.dispatchEvent(new dom.window.Event('visibilitychange'));
      assert.equal(transport.inputSenderDiagnostics.running,true);
      frame(2,{...body,health:{defeated:true}});
      assert.equal(transport.inputSenderDiagnostics.running,false);
      for(let i=0;i<5;i++){advance(5);healthy.receive({type:'pong'});}
      assert.equal(healthy.readyState,1,'a paused round with a healthy transport must not force reconnect');
    } finally {sender.stopInputSender();}
    transport.disconnectRustServer();
    const count = sockets.length; advance(60); assert.equal(sockets.length,count,'explicit disconnect cancels deadlines and retry');
  } finally {
    transport?.disconnectRustServer(); t.mock.timers.reset();
    if(clock)Object.defineProperty(performance,'now',clock);else delete performance.now;
    await vite.close(); dom.window.close(); globalThis.WebSocket=previousSocket;
    for(const[key,value]of original){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
  }
});
