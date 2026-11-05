#!/usr/bin/env node
/** Two full 5v5 worlds, socket load, exact-team reconnect and queued backfill. */
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {startTestServer} from './lib/live-match-server.mjs';
import {encodePackedInput} from '../frontend/src/net/packedInput.ts';

const test = await startTestServer({AVENLAB_ALPHA_LIMITS: '1', AVENLAB_ROLE_LIMITS: '1', AVENLAB_MAX_ACTIVE_WORLDS: '2', AVENLAB_MAX_PLAYERS: '20', AVENLAB_RECONNECT_GRACE_SECONDS: '4'});
const {newPeer, join} = test, checks = [], worlds = [], metrics = [];
const duration = Math.min(300000, Math.max(5000, Number(process.env.AVENLAB_SOAK_MS) || 120000));
let inputTimer;
const deadline = (promise, ms, label) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {timer = setTimeout(() => reject(Error(label)), ms);})]).finally(() => clearTimeout(timer));
};
const summarize = values => {
  values.sort((a,b) => a-b);
  return {samples: values.length, p50: values[Math.floor((values.length-1)*.5)] ?? null, p95: values[Math.floor((values.length-1)*.95)] ?? null, p99: values[Math.floor((values.length-1)*.99)] ?? null, max: values.at(-1) ?? null};
};
try {
  for (const mode of ['quickplay', 'competitive']) {
    test.phase = mode + ' full 5v5 admission and deployment';
    const world = {mode, peers: [], teams: {red: [], blue: []}};
    worlds.push(world);
    for (let i=0; i<10; i++) {
      const peer = await newPeer(mode + ' driver ' + i), joined = await join(peer, mode, 5);
      assert.equal(joined.status, 'joined');
      world.id ??= joined.world_id; assert.equal(joined.world_id, world.id);
      const seat = await peer.active(a => a.world_id === world.id);
      assert.equal(seat.capacity, 10);
      peer.team = seat.team; world.peers.push(peer); world.teams[seat.team].push(peer);
    }
    for (const team of Object.values(world.teams)) {
      assert.equal(team.length, 5);
      for (let i=0; i<5; i++) {
        team[i].hero = ['tank', 'brz', 'camaro', 'cx30', 'mechanic'][i];
        team[i].vehicle = ['tank', 'brz', 'camaro', 'cx30', 'fortuner'][i];
        await team[i].command('hero_select', {hero: team[i].hero});
      }
    }
    for (const peer of world.peers.slice(0,9)) await peer.deploy(peer.vehicle);
    const waiting = await world.peers[0].wait(m => m.type === 'snapshot' && m.data.entities?.length === 9 && m.data.match_state?.phase === 'waiting');
    assert.equal(waiting.world_id, world.id);
    await world.peers[9].deploy(world.peers[9].vehicle);
    const running = await world.peers[0].wait(m => m.type === 'snapshot' && m.data.entities?.length === 10 && m.data.match_state?.phase === 'running');
    world.match = running.data.match_state.match_id;
    assert.equal(running.data.match_state.training, false);
    checks.push(mode + ': ten unique players, five per side, waits for tenth deployment before scored CTF starts');
  }
  assert.notEqual(worlds[0].id, worlds[1].id);
  assert.notEqual(worlds[0].match, worlds[1].match);
  test.phase = 'malformed input and excess ingress';
  for (const payload of [new Uint8Array(78), '{malformed', ' '.repeat(1024*1024)]) {
    const rogue = await newPeer();
    for (let i=0; i<(typeof payload === 'string' && payload.length > 1000 ? 4 : 700); i++) {
      if (rogue.socket.readyState === WebSocket.OPEN) rogue.socket.send(payload);
    }
    await deadline(rogue.closed, 4000, 'Ingress flood was not disconnected');
  }
  checks.push('Binary/JSON packet floods and oversized-byte bursts are disconnected before unlimited decoding');
  const anonymous = [];
  for (let i=0; i<8; i++) anonymous.push(await newPeer());
  const anonymousStart = performance.now();
  const anonymousExpired = Promise.all(anonymous.map(p => p.closed));

  test.phase = 'two-world live input and snapshot soak';
  const failures = new Set();
  const driverDelay=monitorEventLoopDelay({resolution:10});driverDelay.enable();
  const started = performance.now();
  for (const world of worlds) {
    const ids = new Set(world.peers.map(p => p.player));
    for(const p of world.peers)p.driverBytes=0;
    const metric = {mode: world.mode, world: world.id, received_bytes: 0, snapshots: 0, gaps: [], worst: [], work: [], physics: [], locks: [], last: null, lastTick: -1};
    metrics.push(metric);
    for (const peer of world.peers) peer.driverBytes=0;
    for (const [index,peer] of world.peers.entries()) peer.observe = (message, text) => {
      if (message.type !== 'snapshot') return;
      metric.received_bytes += Buffer.byteLength(text); metric.snapshots++;
      peer.ack = Math.max(peer.ack ?? 0, message.data.entities.find(e => e.id === peer.player)?.last_input_seq ?? 0);
      if (message.world_id !== world.id || message.data.entities.some(e => !ids.has(e.id))) failures.add('Cross-world entity leakage');
      if (message.data.entities.length !== 10) failures.add('Lost a deployed player during steady input');
      if (message.data.match_state.match_id !== world.match) failures.add('Round changed unexpectedly');
      if (index !== 0) return;
      const now = performance.now();
      if (metric.last !== null) {
        const gap=now-metric.last; metric.gaps.push(gap);
        if (gap>100 && (metric.worst.length<5 || gap>metric.worst.at(-1).gap_ms)) {
          metric.worst.push({offset_s:(now-started)/1000,gap_ms:gap,simulation_ticks:message.data.tick-metric.lastTick,
            last_tick_work_ms:message.data.server_timing?.work_ms,last_tick_physics_ms:message.data.server_timing?.physics_ms});
          metric.worst.sort((a,b)=>b.gap_ms-a.gap_ms);metric.worst.length=Math.min(metric.worst.length,5);
        }
      }
      metric.last = now;
      if (message.data.tick <= metric.lastTick) failures.add('Non-monotonic snapshot');
      metric.lastTick = message.data.tick;
      const timing = message.data.server_timing;
      for (const [key,field] of [['work','work_ms'],['physics','physics_ms'],['locks','lock_ms']])
        if (Number.isFinite(timing?.[field])) metric[key].push(timing[field]);
    };
  }
  let seq = 0;
  inputTimer = setInterval(() => {
    seq++;
    for (const world of worlds) for (const [index,peer] of world.peers.entries()) {
      if (peer.socket.readyState !== WebSocket.OPEN) {failures.add('Active player socket closed'); continue;}
      // Real inputs through the production mailbox; server remains authoritative.
      const input = {type:'input',seq,dt:1/60,throttle:.6,steer:(Math.floor(seq/180)+index)%2?.15:-.15,
        brake:0,handbrake:0,vehicleMask:97,playerMask:0,debug_mask:0,
        combat:{enabled:true,fire:true,ram:false,hull_locked:false,x:0,y:0,z:0,
          yaw:seq*.004+index,pitch:0,weapon:seq%240<120?'cannon':'coax',role:'assault'}};
      peer.socket.send(index%2 ? encodePackedInput(input) : JSON.stringify(input));
    }
  }, 1000/60);
  await delay(duration);
  clearInterval(inputTimer); inputTimer = null;
  driverDelay.disable();
  const elapsed = performance.now()-started;
  for (const [index,world] of worlds.entries()) {
    metrics[index].driver_bytes=world.peers.reduce((sum,p)=>sum+(p.driverBytes??0),0);
    metrics[index].received_bytes+=metrics[index].driver_bytes;
    for (const peer of world.peers) peer.observe=null;
  }
  const measurements=()=>({checks, failures:failures.size, duration_ms:elapsed, input_batches:seq,compact:process.env.AVENLAB_SNAPSHOT_VERSION !== '0',tire_thermals:process.env.AVENLAB_TIRE_THERMALS==='1',
    driver_event_loop_ms:{p95:driverDelay.percentile(95)/1e6,max:driverDelay.max/1e6},scope:'Localhost production sockets and headless physics; no browser rendering or WAN latency measurement.',
    worlds:metrics.map(m => ({mode:m.mode,world:m.world,snapshots:m.snapshots,received_bytes:m.received_bytes,driver_bytes:m.driver_bytes,
      mean_MB_per_second_per_client:m.received_bytes/10/elapsed/1000,mean_bytes_per_snapshot:m.received_bytes/m.snapshots,
      snapshots_per_second_per_client:m.snapshots/10/elapsed*1000,arrival_ms:summarize(m.gaps),largest_gaps:m.worst,
      server_work_ms:summarize(m.work),server_physics_ms:summarize(m.physics),server_lock_ms:summarize(m.locks)}))});
  // Keep the observations even if a performance gate fails later.
  if(process.env.AVENLAB_METRICS_PATH) await (await import('node:fs/promises')).writeFile(
    process.env.AVENLAB_METRICS_PATH,JSON.stringify(measurements(),null,2)+'\n');
  await deadline(anonymousExpired, Math.max(1000, 35000-(performance.now()-anonymousStart)), 'Unidentified upgraded sockets never expire');
  assert.deepEqual([...failures], []);
  assert(metrics.every(m => m.snapshots > duration/1000*10*20), 'Snapshot delivery stopped');
  // Defeated vehicles intentionally clear last_input_seq until respawn.
  assert(worlds.every(w => w.peers.every(p => p.ack > 60)), 'JSON or packed input was not acknowledged');
  if (process.env.AVENLAB_SNAPSHOT_VERSION !== '0') assert(worlds.every(w => w.peers.every(p => p.compactFrames > 30)), 'Compact snapshots were not negotiated');
  checks.push('Two simultaneous full 5v5 worlds stay isolated with monotonically increasing snapshots and no dropped active sockets');
  checks.push('Eight unidentified upgraded WebSockets expire while identified players remain connected');

  const quick = worlds[0], observer = quick.teams.blue[0], original = quick.teams.red[0];
  test.phase = '5v5 reconnect retains exact side, world and role';
  const reconnecting = observer.wait(m => m.type === 'social_state' && m.data.alpha?.roster.some(r => r.id === original.identity.profile_id && r.reconnecting), true);
  await original.disconnect();
  await reconnecting;
  const resumed = await newPeer();
  await resumed.command('identify', {token:original.identity.token, name:'Restored tank'});
  const seat = await resumed.active(a => a.world_id === quick.id);
  assert.equal(seat.team, original.team); assert.equal(seat.hero, original.hero); assert.equal(seat.team_size, 5);
  await resumed.deploy(original.vehicle);
  await observer.wait(m => m.type === 'snapshot' && m.data.entities.length === 10 && m.data.entities.some(e => e.id === resumed.player), true);
  checks.push('Token reconnect restores the same 5v5 match, team and hero without an eleventh body');

  test.phase = 'full-server queue and explicit-leave replacement';
  const queued = await newPeer('Queued replacement');
  assert.equal((await join(queued,'quickplay',5)).status,'queued');
  assert.equal(queued.view?.alpha?.active ?? null, null);
  const departing = quick.teams.blue[4];
  await departing.command('mode_leave');
  const replacement = await queued.active(a => a.world_id === quick.id);
  assert.equal(replacement.team,'blue'); assert.equal(replacement.hero,'');
  await queued.command('hero_select',{hero:'mechanic'}); await queued.deploy('fortuner');
  await observer.wait(m => m.type === 'snapshot' && m.data.entities.length === 10 && m.data.entities.some(e => e.id === queued.player) && m.data.match_state.match_id === quick.match, true);
  checks.push('A queued new player fills an explicit departure in the same running 5v5 round and vacant team');

  test.phase = 'grace period holds the last seat then admits a replacement';
  const expired = quick.teams.red[4];
  const reserved = observer.wait(m => m.type === 'social_state' && m.data.alpha?.roster.some(r => r.id === expired.identity.profile_id && r.reconnecting), true);
  await expired.disconnect();
  await reserved;
  const after = await newPeer('After grace');
  assert.equal((await join(after,'quickplay',5)).status,'queued');
  const freed = await after.active(a => a.world_id === quick.id);
  assert.equal(freed.team,'red');
  await after.command('hero_select',{hero:'mechanic'}); await after.deploy('fortuner');
  const late = await newPeer();
  await late.command('identify',{token:expired.identity.token,name:'Expired return'});
  await late.wait(m => m.type === 'social_state' && m.data.profile.id === expired.identity.profile_id && !m.data.alpha?.active);
  await observer.wait(m => m.type === 'snapshot' && m.data.entities.length === 10 && m.data.entities.some(e => e.id === after.player) && m.data.match_state.match_id === quick.match, true);
  checks.push('A disconnected seat stays reserved for grace, then queued backfill replaces it; an expired token cannot evict the replacement');
  console.log(JSON.stringify(measurements(),null,2));
} finally {
  if (inputTimer) clearInterval(inputTimer);
  await test.close();
}
