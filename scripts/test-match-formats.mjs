#!/usr/bin/env node
/** Production WebSocket admission with four independent mode/size combinations.
 * Uses an isolated disposable server/profile tree and ordinary gameplay only. */
import assert from 'node:assert/strict';
import {startTestServer} from './lib/live-match-server.mjs';

const test = await startTestServer({AVENLAB_ALPHA_LIMITS: '1', AVENLAB_ROLE_LIMITS: '1', AVENLAB_MAX_ACTIVE_WORLDS: '4', AVENLAB_MAX_PLAYERS: '40', AVENLAB_RECONNECT_GRACE_SECONDS: '4'});
const {newPeer, join} = test;
const checks = [];
try {
  test.phase = 'four independent mode and size combinations';
  const seeds = new Map();
  for (const [mode, size] of [['quickplay', 3], ['quickplay', 5], ['competitive', 3], ['competitive', 5]]) {
    const peer = await newPeer(`${mode === 'quickplay' ? 'QP' : 'COMP'} ${size} seed`);
    const result = await join(peer, mode, size); assert.equal(result.status, 'joined');
    peer.world = result.world_id; peer.mode = mode; peer.size = size;
    const active = await peer.active(); assert.equal(active.mode, mode); assert.equal(active.team_size, size); assert.equal(active.capacity, size * 2);
    assert.deepEqual(active.role_caps, size === 3 ? {tank: 1, dps: 1, support: 1} : {tank: 1, dps: 3, support: 2});
    seeds.set(`${mode}:${size}`, peer);
  }
  assert.equal(new Set([...seeds.values()].map(p => p.world)).size, 4);
  const q3 = seeds.get('quickplay:3'), q5 = seeds.get('quickplay:5'), c3 = seeds.get('competitive:3'), c5 = seeds.get('competitive:5');
  await q3.command('refresh');
  await q3.wait(m => m.type === 'social_state' && m.data.limits.active_worlds === 4);
  for (const peer of seeds.values()) {
    const world = q3.view.worlds.find(w => w.id === peer.world);
    assert.equal(world.mode, peer.mode); assert.equal(world.team_size, peer.size); assert.equal(world.max_players, peer.size * 2);
  }
  checks.push('Quickplay and Competitive each admit both 3v3 and 5v5 into four distinct bounded worlds, with authoritative format and role caps');

  test.phase = 'invalid format preserves existing authenticated seat';
  for (const team_size of [4, '3', 0, 999]) {
    const rejected = await q5.request('mode_join', {mode: 'competitive', team_size, hero: ''}); assert.equal(rejected.ok, false);
    await q5.command('refresh'); const active = await q5.active(a => a.world_id === q5.world);
    assert.equal(active.mode, 'quickplay'); assert.equal(active.team_size, 5);
  }
  checks.push('Malformed or unsupported team sizes are rejected before releasing an existing seat');

  test.phase = 'older clients retain the default five-player format';
  const defaultSize = await newPeer('QP default size');
  const defaultJoined = await defaultSize.command('mode_join', {mode: 'quickplay', hero: ''});
  assert.equal(defaultJoined.status, 'joined'); assert.equal(defaultJoined.team_size, 5); assert.equal(defaultJoined.world_id, q5.world);
  checks.push('Omitting team_size preserves the five-player Quickplay default and fills that existing lobby');

  test.phase = 'waiting same-format room fills before another is created';
  const first = [q3];
  for (let index = 1; index < 6; index++) {
    const peer = await newPeer(`QP3 driver ${index}`); first.push(peer);
    const admitted = await join(peer, 'quickplay', 3); assert.equal(admitted.status, 'joined'); assert.equal(admitted.world_id, q3.world);
  }
  const firstRoster = (await q3.wait(m => m.type === 'social_state' && m.data.alpha?.roster.filter(row => row.world_id === q3.world).length === 6)).data.alpha.roster.filter(row => row.world_id === q3.world);
  assert(firstRoster.every(row => row.mode === 'quickplay' && row.team_size === 3));
  for (const team of ['red', 'blue']) assert.equal(firstRoster.filter(row => row.team === team).length, 3);
  checks.push('Six 3v3 seats fill the same waiting Quickplay world; other mode/size worlds never steal those seats');

  test.phase = 'configured world budget queues requested format';
  const seventh = await newPeer('QP3 overflow');
  assert.equal((await join(seventh, 'quickplay', 3)).status, 'queued');
  const queue = (await seventh.wait(m => m.type === 'social_state' && m.data.alpha?.queue?.team_size === 3)).data.alpha.queue;
  assert.equal(queue.mode, 'quickplay'); assert.equal(queue.capacity, 6); assert(!seventh.view.alpha.active);
  const q5Second = await newPeer('QP5 second');
  const filled = await join(q5Second, 'quickplay', 5); assert.equal(filled.status, 'joined'); assert.equal(filled.world_id, q5.world);
  checks.push('The four-world budget queues overflow 3v3 while a newer 5v5 entrant can fill an available matching 5v5 room');

  test.phase = 'a freed world admits a second simultaneous game';
  await c5.command('mode_leave');
  const secondActive = await seventh.active(a => a.mode === 'quickplay' && a.team_size === 3);
  assert.notEqual(secondActive.world_id, q3.world); assert.equal(secondActive.capacity, 6);
  await seventh.command('refresh');
  await seventh.wait(m => m.type === 'social_state' && m.data.limits.active_worlds === 4);
  assert.equal(seventh.view.limits.max_active_worlds, 4); assert(seventh.view.limits.active_worlds <= 4);
  const remainingFirst = seventh.view.alpha.roster.filter(row => row.world_id === q3.world && !row.reconnecting);
  assert.equal(remainingFirst.length, 6);
  checks.push('After another world empties, the queued player gets a second concurrent Quickplay 3v3 game while the first remains full and isolated');

  test.phase = 'role selection and scored 3v3 deployment';
  const teams = {red: [], blue: []};
  for (const peer of first) {const active = await peer.active(); peer.team = active.team; teams[peer.team].push(peer);}
  for (const team of Object.values(teams)) {
    assert.equal(team.length, 3);
    await team[0].command('hero_select', {hero: 'tank'});
    assert.equal((await team[1].request('hero_select', {hero: 'tank'})).ok, false);
    for (let index = 1; index < 3; index++) await team[index].command('hero_select', {hero: ['tank', 'brz', 'cx30'][index]});
    for (let index = 0; index < 3; index++) {team[index].hero = ['tank', 'brz', 'cx30'][index]; team[index].vehicle = team[index].hero;}
  }
  for (const peer of first.slice(0, 5)) await peer.deploy(peer.vehicle);
  const waiting = (await q3.wait(m => m.type === 'snapshot' && m.data.entities?.length === 5 && m.data.match_state?.phase === 'waiting')).data;
  assert.equal(waiting.match_state.mode, 'quickplay'); assert.equal(waiting.match_state.team_size, 3);
  await first[5].deploy(first[5].vehicle);
  const running = (await q3.wait(m => m.type === 'snapshot' && m.data.entities?.length === 6 && m.data.match_state?.phase === 'running')).data;
  assert.equal(running.match_state.mode, 'quickplay'); assert.equal(running.match_state.team_size, 3); assert.equal(running.match_state.training, false);
  assert.equal(running.match_state.captures_to_win, 3);
  checks.push('The modern Quickplay 3v3 format enforces one of each role, waits for six actual deployments, and starts a scored CTF snapshot with independent mode/team_size');

  test.phase = 'late arrivals cannot enter a full round';
  const late = await newPeer('QP3 late driver');
  const admitted = await join(late, 'quickplay', 3); assert.equal(admitted.status, 'joined'); assert.equal(admitted.world_id, secondActive.world_id);
  assert.notEqual(admitted.world_id, q3.world);
  const c3Second = await newPeer('COMP3 second');
  assert.equal((await join(c3Second, 'competitive', 3)).world_id, c3.world);
  checks.push('Late Quickplay entrants fill the second waiting game; Competitive 3v3 stays independent and no new profile enters the running first round');

  test.phase = 'authenticated reconnect restores format and exact world';
  const original = teams.red[0], identity = original.identity;
  await original.disconnect();
  await teams.blue[0].wait(m => m.type === 'social_state' && m.data.alpha?.roster.some(row => row.id === identity.profile_id && row.reconnecting));
  const resumed = await newPeer();
  const restored = await resumed.command('identify', {name: 'QP3 restored tank', token: identity.token}); assert.equal(restored.profile_id, identity.profile_id);
  const active = await resumed.active(a => a.world_id === q3.world);
  assert.equal(active.mode, 'quickplay'); assert.equal(active.team_size, 3); assert.equal(active.team, 'red'); assert.equal(active.hero, 'tank');
  await resumed.deploy('tank');
  const rejoined = (await resumed.wait(m => m.type === 'snapshot' && m.data.entities?.some(e => e.id === resumed.player) && m.data.match_state?.phase === 'running')).data;
  assert.equal(rejoined.match_state.team_size, 3); assert.equal(rejoined.entities.length, 6);
  assert.equal(resumed.view.alpha.roster.filter(row => row.id === identity.profile_id).length, 1);
  checks.push('Token reconnect returns to the same running Quickplay 3v3 world, team and Tank hero without duplicate roster cards');

  test.phase = 'a replacement joins the vacant side of the same running round';
  await teams.blue[2].command('mode_leave');
  const vacant = (await resumed.wait(m => m.type === 'snapshot' && m.data.match_state?.phase === 'running' && m.data.entities?.length === 5, true)).data;
  assert(vacant.entities.every(entity => entity.id !== teams.blue[2].player));
  const replacement = await newPeer('QP3 after departure');
  const replacementSeat = await join(replacement, 'quickplay', 3);
  assert.equal(replacementSeat.status, 'joined'); assert.equal(replacementSeat.world_id, q3.world);
  assert.equal((await replacement.active(a=>a.world_id===q3.world)).team,'blue');
  assert.equal((await replacement.request('hero_select',{hero:'tank'})).ok,false);
  await replacement.command('hero_select',{hero:'cx30'});
  await replacement.deploy('cx30');
  const backfilled = (await resumed.wait(m=>m.type==='snapshot'&&m.data.entities?.some(e=>e.id===replacement.player))).data;
  assert.equal(backfilled.entities.length,6); assert.equal(backfilled.match_state.match_id,running.match_state.match_id);
  checks.push('Explicit leave opens the vacant side of a running 3v3 ahead of another lobby. A new profile chooses the available role and joins the same six-player round.');
  test.phase = 'expired reservation opens a live seat';
  await replacement.disconnect();
  const reservedRow = m => m.type === 'social_state' && m.data.alpha?.roster.find(row=>row.id===replacement.identity.profile_id && row.reconnecting);
  await resumed.wait(reservedRow);
  const reservedArrival = await newPeer('Before timeout');
  assert.equal((await join(reservedArrival,'quickplay',3)).world_id,secondActive.world_id);
  await resumed.wait(m=>m.type==='social_state'&&!m.data.alpha?.roster.some(row=>row.id===replacement.identity.profile_id),true);
  const afterExpiry = await newPeer('After timeout');
  assert.equal((await join(afterExpiry,'quickplay',3)).world_id,q3.world);
  await afterExpiry.command('hero_select',{hero:'cx30'}); await afterExpiry.deploy('cx30');
  const lateReturn = await newPeer();
  await lateReturn.command('identify',{name:'Late return',token:replacement.identity.token});
  await lateReturn.wait(m=>m.type==='social_state'&&m.data.profile.id===replacement.identity.profile_id&&!m.data.alpha?.active);
  const final = (await resumed.wait(m=>m.type==='snapshot'&&m.data.entities?.some(e=>e.id===afterExpiry.player))).data;
  assert.equal(final.match_state.match_id,running.match_state.match_id); assert.equal(final.entities.length,6);
  checks.push('A dropped seat stays reserved until the configured deadline. After expiry, a new driver fills that side and the old token cannot displace them.');
  console.log(JSON.stringify({checks, failures: 0}, null, 2));
 } finally {
  await test.close();
}
