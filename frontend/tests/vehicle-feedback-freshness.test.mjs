import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

test('feedback freshness shares one self-rechecking deadline, never a display sampler or a timer per packet',async t=>{
  const dom=new JSDOM('',{url:'http://localhost',pretendToBeVisual:true}),original=new Map();
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage})){
    original.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  }
  let vite,stopA,stopB,restoreTimers;
  try{
    vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
    const load=name=>vite.ssrLoadModule('/src/'+name);
    const {useNetworkStore:network}=await load('store/session/networkStore.ts');
    const {useUIStore:ui}=await load('store/menus/uiStore.ts');
    const {startVehicleFeedbackFreshness:start,useVehicleFeedbackFreshness:feedback}=await load('combat/vehicleFeedbackFreshness.ts');
    const savedSet=globalThis.setTimeout,savedClear=globalThis.clearTimeout,interval=window.setInterval;
    const pending=new Map();let now=10000,nextId=0,allocations=0,intervals=0,tick=0;
    const clock=t.mock.method(performance,'now',()=>now);
    globalThis.setTimeout=(fn,ms)=>{const id=++nextId;allocations++;pending.set(id,{fn,ms});return id;};
    globalThis.clearTimeout=id=>pending.delete(id);
    window.setInterval=()=>{intervals++;return 0;};
    restoreTimers=()=>{globalThis.setTimeout=savedSet;globalThis.clearTimeout=savedClear;window.setInterval=interval;clock.mock.restore();};
    const frame=()=>network.getState().setSnapshot({tick:++tick,entities:[{id:'me',vehicle_id:'camaro',room_id:1,position:[tick,1,0],rotation:[0,0,0,1]}]},now);
    ui.setState({screen:'sandbox',overlay:null,isModeLoading:false});network.setState({connected:true,playerId:'me',room_id:1});frame();
    stopA=start();stopB=start();
    assert.equal(feedback.getState().signal,'live');assert.equal(pending.size,1);assert.equal(allocations,1);assert.equal(intervals,0);
    for(let i=0;i<20;i++){now+=16;frame();}
    assert.equal(allocations,1,'a received packet never replaces the existing deadline');
    const fire=()=>{const [id,job]=pending.entries().next().value;pending.delete(id);job.fn();};
    now=10501;fire();assert.equal(feedback.getState().signal,'live');assert.equal(pending.size,1);assert.equal(allocations,2);
    now=10822;fire();assert.equal(feedback.getState().signal,'stale');assert.equal(pending.size,0,'stale sessions have no polling loop');
    network.setState({connected:false});assert.equal(feedback.getState().signal,'offline');assert.equal(pending.size,0);
    network.setState({connected:true});frame();assert.equal(feedback.getState().signal,'live');
    stopA();stopA();assert.equal(pending.size,1,'one owner leaving does not stop another');
    ui.setState({overlay:'pause'});assert.equal(feedback.getState().signal,'hidden');assert.equal(pending.size,0);
    ui.setState({overlay:null});assert.equal(pending.size,1);
    Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new window.Event('visibilitychange'));
    assert.equal(pending.size,0);assert.equal(feedback.getState().signal,'hidden');
    Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new window.Event('visibilitychange'));
    assert.equal(pending.size,1);
    stopB();assert.equal(pending.size,0);assert.equal(feedback.getState().signal,'hidden');
    now+=16;frame();assert.equal(pending.size,0,'unmounted owners leave no socket subscription or timeout');
    assert.equal(intervals,0);
  }finally{
    stopA?.();stopB?.();restoreTimers?.();await vite?.close();dom.window.close();
    for(const [key,value] of original){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
  }
});
