#!/usr/bin/env node
/** Production WebSocket admission with four independent mode/size combinations.
 * Uses an isolated disposable server/profile tree and ordinary gameplay only. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binary = process.env.AVENLAB_SERVER_BIN ?? path.join(repo, 'avenlab-server/target/debug', process.platform === 'win32' ? 'avenlab-server.exe' : 'avenlab-server');
if (!fs.existsSync(binary)) throw Error('Build Rust first: cargo build --manifest-path avenlab-server/Cargo.toml');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'avenlab-match-formats-'));
const reservation = net.createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const server = spawn(binary, [], {
  cwd: path.join(repo, 'avenlab-server'),
  env: {...process.env, AVENLAB_BIND: `127.0.0.1:${port}`, AVENLAB_SOCIAL_PATH: path.join(directory, 'social.json'), AVENLAB_ALPHA_LIMITS: '1', AVENLAB_ROLE_LIMITS: '1', AVENLAB_MAX_ACTIVE_WORLDS: '4', AVENLAB_MAX_PLAYERS: '40'},
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '', phase = 'startup';
const peers = [], checks = [];
for (const stream of [server.stdout, server.stderr]) stream.on('data', bytes => output = (output + bytes.toString()).slice(-24000));
const started = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('Server startup timed out: ' + output.slice(-1600))), 15000);
  server.stdout.on('data', bytes => {if (bytes.toString().includes('WebSocket listening')) {clearTimeout(timer); resolve();}});
  server.once('error', error => {clearTimeout(timer); reject(error);});
  server.once('exit', code => {clearTimeout(timer); if (code) reject(Error('Server exited: ' + code));});
});
class Peer {
  constructor() {
    this.serial = 0; this.messages = []; this.waiters = []; this.view = null;
    this.socket = new WebSocket(`ws://127.0.0.1:${port}`);
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data); this.messages.push(message);
      if (this.messages.length > 240) this.messages.shift();
      if (message.type === 'social_state') this.view = message.data;
      for (const waiter of [...this.waiters]) if (waiter.test(message)) {clearTimeout(waiter.timer); this.waiters.splice(this.waiters.indexOf(waiter), 1); waiter.resolve(message);}
    });
  }
  wait(test, fresh = false) {
    if (!fresh) {const found = this.messages.findLast(test); if (found) return Promise.resolve(found);}
    return new Promise((resolve, reject) => {
      const waiter = {test, resolve, timer: setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(Error('Timed out in ' + phase + '; state=' + JSON.stringify(this.view?.alpha) + '; server=' + output.slice(-1800)));
      }, 22000)}; this.waiters.push(waiter);
    });
  }
  async ready(name) {const welcome = await this.wait(m => m.type === 'welcome'); this.player = welcome.player_id; if (name) this.identity = await this.command('identify', {name}); return this;}
  async request(action, fields = {}) {const request_id = `formats-${++this.serial}`, reply = this.wait(m => m.type === 'social_result' && m.request_id === request_id, true); this.socket.send(JSON.stringify({type: 'social_request', action, request_id, ...fields})); return reply;}
  async command(action, fields = {}) {const response = await this.request(action, fields); assert(response.ok, response.message); return response.data;}
  async active(test = () => true) {return (await this.wait(m => m.type === 'social_state' && m.data.alpha?.active && test(m.data.alpha.active))).data.alpha.active;}
  async deploy(vehicle) {const reply = this.wait(m => m.type === 'spawn_ready' || m.type === 'spawn_error', true); this.socket.send(JSON.stringify({type: 'spawn_request', map: 'streaming_endless_city', vehicle, mode: 'quickplay'})); const result = await reply; assert.equal(result.type, 'spawn_ready', result.message); return result;}
  async disconnect() {if (this.socket.readyState === WebSocket.CLOSED) return; const closed = new Promise(resolve => this.socket.addEventListener('close', resolve, {once: true})); this.socket.close(); await closed;}
  close() {for (const waiter of this.waiters) clearTimeout(waiter.timer); this.waiters = []; this.socket.close();}
}
const newPeer = async name => {const peer = await new Peer().ready(name); peers.push(peer); return peer;};
const join = async (peer, mode, teamSize) => {
  const result = await peer.command('mode_join', {mode, team_size: teamSize, hero: ''});
  assert.equal(result.team_size, teamSize); assert.equal(result.mode, mode);
  return result;
};
try {
  await started;
  phase = 'four independent mode and size combinations';
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

  phase = 'invalid format preserves existing authenticated seat';
  for (const team_size of [4, '3', 0, 999]) {
    const rejected = await q5.request('mode_join', {mode: 'competitive', team_size, hero: ''}); assert.equal(rejected.ok, false);
    await q5.command('refresh'); const active = await q5.active(a => a.world_id === q5.world);
    assert.equal(active.mode, 'quickplay'); assert.equal(active.team_size, 5);
  }
  checks.push('Malformed or unsupported team sizes are rejected before releasing an existing seat');

  phase = 'older clients retain the default five-player format';
  const defaultSize = await newPeer('QP default size');
  const defaultJoined = await defaultSize.command('mode_join', {mode: 'quickplay', hero: ''});
  assert.equal(defaultJoined.status, 'joined'); assert.equal(defaultJoined.team_size, 5); assert.equal(defaultJoined.world_id, q5.world);
  checks.push('Omitting team_size preserves the five-player Quickplay default and fills that existing lobby');

  phase = 'waiting same-format room fills before another is created';
  const first = [q3];
  for (let index = 1; index < 6; index++) {
    const peer = await newPeer(`QP3 driver ${index}`); first.push(peer);
    const admitted = await join(peer, 'quickplay', 3); assert.equal(admitted.status, 'joined'); assert.equal(admitted.world_id, q3.world);
  }
  const firstRoster = (await q3.wait(m => m.type === 'social_state' && m.data.alpha?.roster.filter(row => row.world_id === q3.world).length === 6)).data.alpha.roster.filter(row => row.world_id === q3.world);
  assert(firstRoster.every(row => row.mode === 'quickplay' && row.team_size === 3));
  for (const team of ['red', 'blue']) assert.equal(firstRoster.filter(row => row.team === team).length, 3);
  checks.push('Six 3v3 seats fill the same waiting Quickplay world; other mode/size worlds never steal those seats');

  phase = 'configured world budget queues requested format';
  const seventh = await newPeer('QP3 overflow');
  assert.equal((await join(seventh, 'quickplay', 3)).status, 'queued');
  const queue = (await seventh.wait(m => m.type === 'social_state' && m.data.alpha?.queue?.team_size === 3)).data.alpha.queue;
  assert.equal(queue.mode, 'quickplay'); assert.equal(queue.capacity, 6); assert(!seventh.view.alpha.active);
  const q5Second = await newPeer('QP5 second');
  const filled = await join(q5Second, 'quickplay', 5); assert.equal(filled.status, 'joined'); assert.equal(filled.world_id, q5.world);
  checks.push('The four-world budget queues overflow 3v3 while a newer 5v5 entrant can fill an available matching 5v5 room');

  phase = 'a freed world admits a second simultaneous game';
  await c5.command('mode_leave');
  const secondActive = await seventh.active(a => a.mode === 'quickplay' && a.team_size === 3);
  assert.notEqual(secondActive.world_id, q3.world); assert.equal(secondActive.capacity, 6);
  await seventh.command('refresh');
  await seventh.wait(m => m.type === 'social_state' && m.data.limits.active_worlds === 4);
  assert.equal(seventh.view.limits.max_active_worlds, 4); assert(seventh.view.limits.active_worlds <= 4);
  const remainingFirst = seventh.view.alpha.roster.filter(row => row.world_id === q3.world && !row.reconnecting);
  assert.equal(remainingFirst.length, 6);
  checks.push('After another world empties, the queued player gets a second concurrent Quickplay 3v3 game while the first remains full and isolated');

  phase = 'role selection and scored 3v3 deployment';
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
  const visibleWaiting = first.slice(0,5).filter(peer=>peer.team===q3.team).length;
  const waiting = (await q3.wait(m => m.type === 'snapshot' && m.data.entities?.length === visibleWaiting && m.data.match_state?.phase === 'waiting')).data;
  assert(waiting.entities.every(entity=>entity.team===q3.team),'warm-up frames preserve opposing hero mystery');
  assert.equal(waiting.match_state.mode, 'quickplay'); assert.equal(waiting.match_state.team_size, 3);
  await first[5].deploy(first[5].vehicle);
  const running = (await q3.wait(m => m.type === 'snapshot' && m.data.entities?.length === 6 && m.data.match_state?.phase === 'running')).data;
  assert.equal(running.match_state.mode, 'quickplay'); assert.equal(running.match_state.team_size, 3); assert.equal(running.match_state.training, false);
  assert.equal(running.match_state.captures_to_win, 3);
  checks.push('The modern Quickplay 3v3 format enforces one of each role, waits for six actual deployments, and starts a scored CTF snapshot with independent mode/team_size');

  phase = 'late arrivals never enter a running round';
  const late = await newPeer('QP3 late driver');
  const admitted = await join(late, 'quickplay', 3); assert.equal(admitted.status, 'joined'); assert.equal(admitted.world_id, secondActive.world_id);
  assert.notEqual(admitted.world_id, q3.world);
  const c3Second = await newPeer('COMP3 second');
  assert.equal((await join(c3Second, 'competitive', 3)).world_id, c3.world);
  checks.push('Late Quickplay entrants fill the second waiting game; Competitive 3v3 stays independent and no new profile enters the running first round');

  phase = 'authenticated reconnect restores format and exact world';
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

  phase = 'a vacant running seat cannot admit a new profile';
  await teams.blue[2].command('mode_leave');
  const vacant = (await resumed.wait(m => m.type === 'snapshot' && m.data.match_state?.phase === 'running' && m.data.entities?.length === 5, true)).data;
  assert(vacant.entities.every(entity => entity.id !== teams.blue[2].player));
  const replacement = await newPeer('QP3 after departure');
  const replacementSeat = await join(replacement, 'quickplay', 3);
  assert.equal(replacementSeat.status, 'joined'); assert.equal(replacementSeat.world_id, secondActive.world_id);
  assert.notEqual(replacementSeat.world_id, q3.world);
  checks.push('Even after an explicit leave frees a running seat, a new profile enters the waiting game rather than joining the scored round in progress');
  console.log(JSON.stringify({checks, failures: 0}, null, 2));
} finally {
  for (const peer of peers) peer.close(); server.kill();
  await new Promise(resolve => {if (server.exitCode !== null) resolve(); else server.once('exit', resolve);});
  fs.rmSync(directory, {recursive: true, force: true});
}
