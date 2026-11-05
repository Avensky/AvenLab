import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';

test('network readers receive only their fields and release their upstream listener', async () => {
  const vite = await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  try {
    const {useNetworkStore:net} = await vite.ssrLoadModule('/src/store/session/networkStore.ts');
    const views = await vite.ssrLoadModule('/src/store/session/networkViews.ts');
    const {useConnectionView:identity,useMotionView:motion,useDiagnosticsView:debug} = views;
    net.getState().resetSession();
    net.setState({connected:true,playerId:'self',room_id:4});
    const observed = [0,0,0], groups=[identity,motion,debug];
    const stops = groups.map((v,i)=>v.subscribe((next,previous)=>{
      assert.notEqual(next,previous);
      observed[i]++;
    }));
    try {
      for(let tick=1;tick<=600;tick++){
        net.getState().setSnapshot({tick,entities:[]},tick*33);
        if(tick%3===0) net.getState().setDebugOverlay({wheels:[],chassis:[]},tick);
        if(tick%150===0) net.getState().setPingMs(tick/150);
      }
      assert.deepEqual(observed,[0,600,204]);
      assert.equal(motion.getState().snapshot,net.getState().snapshot);
      assert.equal(debug.getState().debugTick,600);
      net.getState().setDebugOverlay({wheels:[],chassis:[]},599);
      assert.deepEqual(observed,[0,600,204]);
      net.getState().resetWorld();
      assert.equal(motion.getState().snapshot,null);
      assert.equal(debug.getState().debugOverlay,null);
      net.getState().resetSession();
      assert.equal(identity.getState().connected,false);
      assert.equal(debug.getState().pingMs,null);
    } finally { stops.forEach(stop=>stop()); }
    // No mounted readers. Re-entry must immediately see the newest session.
    net.setState({connected:true,room_id:8,playerId:'new'});
    assert.equal(identity.getState().room_id,8);
    assert.equal(identity.getState(),identity.getState());
    let calls=0;
    const listener=()=>calls++;
    const stop1=identity.subscribe(listener),stop2=identity.subscribe(listener);
    stop1();
    net.setState({team:'red'});assert.equal(calls,1);
    stop2();net.setState({team:'blue'});assert.equal(calls,1);
  } finally {await vite.close();}
});

test('held inputs skip packet building while device priority and direct overrides still work',async()=>{
  const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  try {
    const {useInputStore:store}=await vite.ssrLoadModule('/src/store/input/inputStore.ts');
    const {VehicleFlags,PlayerFlags}=await vite.ssrLoadModule('/src/store/input/protocol/inputMasks.ts');
    const input=store.getState(), setInput=input.setInput;
    let builds=0;
    store.setState({setInput:packet=>{builds++;setInput(packet);}});
    const poll=()=>{input.setAnalogFromSource('gamepad',{throttle:.5,steer:.25});input.setHeldVehicleFlag('gamepad',VehicleFlags.BOOST,true);input.setHeldPlayerFlag('gamepad',PlayerFlags.HONK,true);};
    poll();
    builds=0;
    for(let i=0;i<600;i++)poll();
    assert.equal(builds,0);
    input.setAnalogFromSource('keyboard',{steer:-1});poll();
    assert.equal(store.getState().input.steer,-1);
    input.releaseInputSource('keyboard');
    assert.equal(store.getState().input.steer,.25);
    input.setAnalog({throttle:0});poll();
    assert.equal(store.getState().input.throttle,.5);
    input.setHeldPlayerFlag('keyboard',PlayerFlags.HONK,true);
    input.releaseInputSource('gamepad');
    assert(store.getState().input.playerMask & PlayerFlags.HONK);
    input.setMenuBrake(true);poll();
    assert.equal(store.getState().input.brake,1);assert.equal(store.getState().input.throttle,0);
    input.setMenuBrake(false);poll();
    assert.equal(store.getState().input.throttle,.5);
    input.resetWorldControls();
    assert.equal(store.getState().input.throttle,0);
  }finally{await vite.close();}
});
