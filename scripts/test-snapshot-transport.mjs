#!/usr/bin/env node
/** Actual legacy/compact peers in one room: exact parity, negotiation and privacy. */
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {startTestServer} from './lib/live-match-server.mjs';
const checks=[];
for (const privateWarmup of [false,true]) {
 const test=await startTestServer({AVENLAB_HIDE_WARMUP_ENEMIES:privateWarmup?'1':'0',AVENLAB_ALPHA_LIMITS:'1',AVENLAB_ROLE_LIMITS:'1',AVENLAB_TIRE_THERMALS:'1'});
 try {
  test.phase=privateWarmup?'compact warmup privacy':'mixed snapshot negotiation';
  const compact=await test.newPeer('compact driver',true), legacy=await test.newPeer('legacy driver',false);
  const a=await test.join(compact,'quickplay',5), b=await test.join(legacy,'quickplay',5);
  assert.equal(a.world_id,b.world_id);
  await compact.command('hero_select',{hero:'tank'});await legacy.command('hero_select',{hero:'brz'});
  await compact.deploy('tank');await legacy.deploy('brz');
  if(privateWarmup){
   for(const peer of [compact,legacy]) {
    const frame=await peer.wait(m=>m.type==='snapshot'&&m.data.entities.length>0,true);
    const side=(await peer.active()).team;
    assert(frame.data.entities.every(e=>e.team===side),'enemy identity leaked in private warmup');
   }
   assert(compact.compactFrames>0);checks.push('Private warmup filters identities before both encoders');
   continue;
  }
  const frames=[new Map(),new Map()];let compared=0,compactBytes=0,legacyBytes=0,problem;
  for(const [i,peer] of [compact,legacy].entries()) peer.observe=(message,text)=>{
   if(message.type!=='snapshot')return;
   frames[i].set(message.data.tick,{message,text});
   while(frames[i].size>16)frames[i].delete(frames[i].keys().next().value);
   const other=frames[1-i].get(message.data.tick);
   if(other){
    try{
      const shared=m=>({...m,data:{...m.data,entities:m.data.entities.map(e=>{
        const copy={...e};for(const k of ['last_input_seq','cockpit_mask','cabin_mask','parking_brake','cruise_target_kph','fuel','temp','engine_torque'])delete copy[k];
        return copy;
      })}});
      const masked=i===0?message:other.message, owner=masked.data.entities.find(e=>e.id===compact.player);
      assert(owner && Number.isFinite(owner.fuel) && Number.isFinite(owner.temp));
      for(const e of masked.data.entities.filter(e=>e.id!==compact.player)) assert(!('fuel' in e) && !('cabin_mask' in e) && !('last_input_seq' in e));
      assert.deepEqual(shared(message),shared(other.message));compared++;compactBytes+=Buffer.byteLength(i===0?text:other.text);legacyBytes+=Buffer.byteLength(i===1?text:other.text);}
    catch(error){problem=error;}
   }
  };
  const deadline=performance.now()+10000;
  while(compared<30&&!problem&&performance.now()<deadline)await delay(20);
  assert.ifError(problem);assert(compared>=30,'paired snapshots stopped');
  compact.observe=legacy.observe=null;
  assert(compactBytes<legacyBytes*.65,'compact payload did not shrink enough');
  checks.push(`Mixed peers: ${compared} identical shared snapshots; private fuel/cabin/ack only on the driver; compact bytes ${compactBytes}/${legacyBytes}`);
  const rawSnapshot=(peer,type)=>peer.wait(m=>m.type==='snapshot'&&peer.lastWireType===type,true);
  compact.socket.send(JSON.stringify({type:'snapshot_format',version:0}));await rawSnapshot(compact,'snapshot');
  compact.socket.send(JSON.stringify({type:'snapshot_format',version:999}));await rawSnapshot(compact,'snapshot');
  compact.socket.send(JSON.stringify({type:'snapshot_format',version:1}));await rawSnapshot(compact,'snapshot_compact');
  checks.push('Explicit fallback, rejected unknown version and compact renegotiation work on the same connection');
  compact.dropNextDelta=5;
  await compact.wait(m=>m.type==='snapshot'&&compact.dropNextDelta===0,true);
  compact.allowResync=true;compact.decoder.reset();
  await rawSnapshot(compact,'snapshot_compact');
  await rawSnapshot(compact,'snapshot_delta');
  assert.equal(compact.resyncRequests,1);
  checks.push('Five discarded deltas recover; a missing baseline requests one resync and resumes');
  let seq=0;
  const held={type:'input',dt:.1,throttle:0,steer:0,brake:0,handbrake:0,vehicleMask:97,playerMask:0,
   combat:{enabled:true,fire:true,ram:false,hull_locked:false,weapon:'coax',yaw:0,pitch:0,x:0,y:0,z:0,role:'assault'}};
  for(let i=0;i<7;i++) {compact.socket.send(JSON.stringify({...held,seq:++seq}));await delay(100);}
  const holding=await compact.wait(m=>m.type==='snapshot'&&m.data.entities.some(e=>e.id===compact.player&&e.last_input_seq===seq),true);
  assert(holding.data.entities.find(e=>e.id===compact.player).combat.enabled,'100 ms refresh must keep held combat active');
  compact.socket.send(JSON.stringify({...held,seq:++seq,combat:{...held.combat,fire:false,enabled:false}}));
  await compact.wait(m=>m.type==='snapshot'&&m.data.entities.some(e=>e.id===compact.player&&e.last_input_seq===seq&&!e.combat.enabled&&!e.combat.fire),true);
  checks.push('100 ms held-input refresh remains active; releasing controls reaches authoritative state');
  legacy.socket.send(JSON.stringify({...held,seq:1,debug_mask:2,combat:{...held.combat,fire:false}}));
  const wheels=await legacy.wait(m=>m.type==='debug'&&m.data.wheels.length>0,true);
  assert(wheels.data.wheels.every(w=>w.player_id===legacy.player && w.tire?.length===2 && w.tire.every(Number.isFinite)));
  assert.equal(wheels.data.chassis.length,0);
  compact.socket.send(JSON.stringify({...held,seq:++seq,debug_mask:1,combat:{...held.combat,fire:false}}));
  const chassis=await compact.wait(m=>m.type==='debug'&&m.data.chassis.length>0,true);
  assert(chassis.data.chassis.every(c=>c.player_id===compact.player));assert.equal(chassis.data.wheels.length,0);
  legacy.socket.send(JSON.stringify({...held,seq:2,debug_mask:130,combat:{...held.combat,fire:false}}));
  const all=await legacy.wait(m=>m.type==='debug'&&m.data.wheels.some(w=>w.player_id===compact.player),true);
  assert(all.data.wheels.filter(w=>w.player_id===compact.player).every(w=>!('tire' in w)));
  assert(all.tick%6===0 && chassis.tick%6===0 && wheels.tick%6===0);
  checks.push('Requested diagnostics arrive on six-tick boundaries; local/all scopes and channel masks are isolated; only pneumatic tires expose heat and PSI');
 } finally {await test.close();}
}
console.log(JSON.stringify({checks,failures:0},null,2));
