#!/usr/bin/env node
/** Six real authenticated 3v3 clients and one disposable server/profile tree.
 * Uses production admission, deployment, input and ability RPCs only. No test
 * damage/HP/teleport endpoint, map edit, or existing player's data is involved. */
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
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'avenlab-support-abilities-'));
const reservation = net.createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const server = spawn(binary, [], {
  cwd: path.join(repo, 'avenlab-server'),
  env: {...process.env, AVENLAB_BIND: `127.0.0.1:${port}`, AVENLAB_SOCIAL_PATH: path.join(directory, 'social.json'), AVENLAB_ALPHA_LIMITS: '1', AVENLAB_ROLE_LIMITS: '1', AVENLAB_MAX_ACTIVE_WORLDS: '3', AVENLAB_MAX_PLAYERS: '12'},
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '', phase = 'startup', inputTimer;
const peers = [], checks = [], limits = [];
for (const stream of [server.stdout, server.stderr]) stream.on('data', bytes => output = (output + bytes.toString()).slice(-24000));
const started = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('Server startup timed out: ' + output.slice(-1600))), 15000);
  server.stdout.on('data', bytes => {if (bytes.toString().includes('WebSocket listening')) {clearTimeout(timer); resolve();}});
  server.once('error', error => {clearTimeout(timer); reject(error);});
  server.once('exit', code => {clearTimeout(timer); if (code) reject(Error('Server exited: ' + code));});
});
const entity = (frame, id) => frame?.data?.entities?.find(row => row.id === id);
class Peer {
  constructor() {
    this.serial = 0; this.sequence = 0; this.messages = []; this.waiters = []; this.latest = null;
    this.control = {throttle: 0, steer: 0, brake: 1, handbrake: 0, vehicleMask: 1, playerMask: 0,
      combat: {enabled: true, fire: false, weapon: 'primary', yaw: 0, pitch: -0.12, hull_locked: false, ram: false, role: 'assault', x: 0, y: 1.1, z: 0}};
    this.socket = new WebSocket(`ws://127.0.0.1:${port}`);
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data); this.messages.push(message); if (this.messages.length > 240) this.messages.shift();
      if (message.type === 'snapshot') this.latest = message;
      for (const waiter of [...this.waiters]) if (waiter.test(message)) {clearTimeout(waiter.timer); this.waiters.splice(this.waiters.indexOf(waiter), 1); waiter.resolve(message);}
    });
  }
  wait(test, fresh = false) {
    if (!fresh) {const found = this.messages.findLast(test); if (found) return Promise.resolve(found);}
    return new Promise((resolve, reject) => {
      const waiter = {test, resolve, timer: setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(Error('Timed out in ' + phase + '; latest=' + JSON.stringify(this.latest?.data?.entities?.map(e => ({id:e.id, vehicle:e.vehicle_id, team:e.team, gear:e.gear, guard:e.guard, support:e.support, health:e.health, position:e.position}))) + '; server=' + output.slice(-1800)));
      }, 18000)}; this.waiters.push(waiter);
    });
  }
  async ready(name) {const welcome = await this.wait(m => m.type === 'welcome'); this.player = welcome.player_id; if (name) this.identity = await this.command('identify', {name}); return this;}
  async request(action, fields = {}) {const request_id = `support-${++this.serial}`, reply = this.wait(m => m.type === 'social_result' && m.request_id === request_id, true); this.socket.send(JSON.stringify({type: 'social_request', action, request_id, ...fields})); return reply;}
  async command(action, fields = {}) {const response = await this.request(action, fields); assert(response.ok, response.message); return response.data;}
  async deploy(vehicle) {const reply = this.wait(m => m.type === 'spawn_ready' || m.type === 'spawn_error', true); this.socket.send(JSON.stringify({type: 'spawn_request', map: 'streaming_endless_city', vehicle, mode: 'skirmish'})); const result = await reply; assert.equal(result.type, 'spawn_ready', result.message); return result;}
  tick() {if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({type: 'input', seq: ++this.sequence, dt: 1 / 60, ...this.control}));}
  async disconnect() {if (this.socket.readyState === WebSocket.CLOSED) return; const closed = new Promise(resolve => this.socket.addEventListener('close', resolve, {once:true})); this.socket.close(); await closed;}
  close() {for (const waiter of this.waiters) clearTimeout(waiter.timer); this.waiters = []; this.socket.close();}
}
const reject = async (peer, action, fields = {}, pattern) => {const result = await peer.request(action, fields); assert.equal(result.ok, false, `${action} unexpectedly succeeded`); if (pattern) assert.match(result.message, pattern); return result;};
const next = (peer, test = () => true) => peer.wait(m => m.type === 'snapshot' && test(m), true);
const closeTo = (actual, expected, tolerance, message) => assert(Math.abs(actual - expected) <= tolerance, `${message}: ${actual}, expected ${expected} ± ${tolerance}`);

try {
  await started;
  phase = 'six distinct Skirmish profiles';
  let world;
  for (let i = 0; i < 6; i++) {
    const peer = await new Peer().ready(`Support abilities ${i}`); peers.push(peer);
    const joined = await peer.command('mode_join', {mode:'skirmish', hero:''}); world ??= joined.world_id; assert.equal(joined.world_id, world);
  }
  const roster = (await peers[0].wait(m => m.type === 'social_state' && m.data.alpha?.roster?.length === 6)).data.alpha.roster;
  assert.equal(new Set(peers.map(p => p.identity.profile_id)).size, 6);
  const teams = {red:[], blue:[]};
  for (const peer of peers) {peer.team = roster.find(row => row.id === peer.identity.profile_id).team; teams[peer.team].push(peer);}
  for (const team of Object.values(teams)) {
    assert.equal(team.length, 3);
    for (let i = 0; i < 3; i++) {team[i].hero = ['tank','brz','mechanic'][i]; team[i].vehicle = ['tank','brz','fortuner'][i]; await team[i].command('hero_select', {hero:team[i].hero});}
  }
  for (const peer of peers) await peer.deploy(peer.vehicle);
  inputTimer = setInterval(() => {for (const peer of peers) peer.tick();}, 16);
  const running = await peers[0].wait(m => m.type === 'snapshot' && m.data.entities?.length === 6 && m.data.match_state?.phase === 'running');
  await next(peers[0], m => m.data.tick > running.data.tick + 75);
  checks.push('Six distinct profiles deploy Tank, BRZ DPS and Fortuner Mechanic on both teams in a real scored Skirmish');
  const [tank, dps, mechanic] = teams.red, observer = teams.blue[2];
  assert.equal(entity(observer.latest, dps.player).vehicle_id, 'brz'); assert.equal(entity(observer.latest, mechanic.player).vehicle_id, 'fortuner');

  phase = 'actual hero authority and no-need heal';
  await reject(dps, 'vehicle_heal_pack', {hero:'mechanic', target:mechanic.player, healing_hp:99999}, /Mechanic/);
  await reject(mechanic, 'dps_guard_boost', {hero:'brz', shield_hp:99999}, /BRZ DPS/);
  await reject(tank, 'dps_guard_boost', {hero:'brz'}, /BRZ DPS/);
  await reject(dps, 'tank_barrier', {hero:'tank'}, /Tank/);
  const beforeHeal = entity(mechanic.latest, mechanic.player);
  const allyHp = mechanic.latest.data.entities.filter(e => e.team === 'red').map(e => [e.id, e.health.hp]);
  assert(allyHp.every(([id,hp]) => hp === entity(mechanic.latest,id).health.max_hp), 'no-need check requires genuinely healthy allies');
  await reject(mechanic, 'vehicle_heal_pack', {target:teams.blue[0].player, healing_hp:99999, cooldown_s:0, fuel_liters:99999}, /No injured living teammate/);
  const rejectedHealTick = mechanic.latest.data.tick;
  const afterHealFrame = await next(observer, m => m.data.tick > rejectedHealTick);
  const afterHeal = entity(afterHealFrame, mechanic.player);
  assert.equal(afterHeal.support.sequence, 0); assert.equal(afterHeal.support.cooldown_s, 0); assert.equal(afterHeal.support.pack, null);
  assert.equal(afterHeal.health.stats.healing_done, beforeHeal.health.stats.healing_done);
  closeTo(beforeHeal.fuel - afterHeal.fuel, 0, 0.05, 'rejected heal has no pack fuel charge beyond engine idle');
  for (const [id,hp] of allyHp) assert.equal(entity(afterHealFrame,id).health.hp,hp);
  checks.push('Hero authority distinguishes the BRZ DPS and Fortuner Mechanic; forged target/HP/hero/timing fields cannot grant healing, shield or resources, and a no-need pack spends no cooldown/fuel/HP');

  phase = 'raw primary Mechanic suppression and ordinary DPS primary';
  const beforeFire = observer.latest, shot = entity(beforeFire,dps.player).combat.shot, mechanicShot = entity(beforeFire,mechanic.player).combat.shot;
  mechanic.control.combat.fire = true; mechanic.control.combat.role = 'assault'; mechanic.control.combat.ram = true;
  dps.control.combat.fire = true;
  const fired = await next(observer, m => m.data.tick > beforeFire.data.tick + 35 && entity(m,dps.player).combat.shot > shot + 2);
  mechanic.control.combat.fire = false; mechanic.control.combat.ram = false; dps.control.combat.fire = false;
  assert.equal(entity(fired,mechanic.player).combat.shot, mechanicShot); assert.equal(entity(fired,mechanic.player).combat.fire,false); assert.equal(entity(fired,mechanic.player).combat.ram_remaining,0);
  checks.push('Raw damaging-primary/Ram packets are suppressed for the actual Mechanic while an ordinary BRZ DPS emits replicated primary shots');

  phase = 'BRZ Guard Boost resource cost and observer state';
  dps.control.brake = 0;
  // Select first gear through the ordinary packed cockpit command. An idle
  // automatic transmission legitimately remains in neutral without throttle.
  dps.control.cockpit_mask = (2 << 24) | (1 << 16) | (1 << 7);
  dps.tick(); const driveSequence = dps.sequence;
  await next(dps, m => entity(m,dps.player).last_input_seq >= driveSequence && entity(m,dps.player).gear > 0);
  const beforeGuard = entity(dps.latest,dps.player);
  const guard = await dps.command('dps_guard_boost',{shield_hp:999999,duration_s:999,cooldown_s:0,nos_cost:0,fuel_cost:0});
  assert.equal(guard.guard.kind,'brz_guard'); assert.equal(guard.guard.shield_hp,200); assert.equal(guard.guard.remaining_s,4); assert.equal(guard.guard.cooldown_s,20);
  const observedGuard = await next(observer,m => entity(m,dps.player).guard?.remaining_s > 3.5);
  const activeGuard = entity(observedGuard,dps.player);
  closeTo(beforeGuard.fuel - activeGuard.fuel,3,0.08,'Guard Boost fuel cost'); closeTo(beforeGuard.boost_fraction - activeGuard.boost_fraction,0.4,0.00001,'Guard Boost spends four of ten NOS seconds');
  assert.equal(entity(observedGuard,mechanic.player).guard.remaining_s,0); assert.equal(entity(observedGuard,mechanic.player).guard.shield_hp,0);
  await reject(dps,'dps_guard_boost',{},/cooling down/);
  checks.push('Observer sees authoritative BRZ 200HP / four-second guard, twenty-second cooldown and exact 3L + four-second NOS costs; Fortuner Mechanic has no BRZ guard');

  phase = 'Tank barrier resources and reset cooldown';
  const beforeBarrier = entity(tank.latest,tank.player);
  const barrier = await tank.command('tank_barrier',{shield_hp:999999,duration_s:999,cooldown_s:0,fuel_cost:0});
  assert.equal(barrier.guard.kind,'tank_barrier'); assert.equal(barrier.guard.shield_hp,500); assert.equal(barrier.guard.remaining_s,0); assert.equal(barrier.guard.cooldown_s,15);
  const observedBarrier = await next(observer,m => entity(m,tank.player).guard?.shield_hp === 500);
  const activeBarrier = entity(observedBarrier,tank.player);
  closeTo(beforeBarrier.fuel - activeBarrier.fuel,1,0.08,'Tank barrier fuel cost'); closeTo(beforeBarrier.boost_fraction,activeBarrier.boost_fraction,0.000001,'Tank barrier spends no NOS');
  await reject(tank,'tank_barrier',{},/cooling down/);
  tank.control.playerMask = 32; dps.control.playerMask = 32;
  const resetTick = observedBarrier.data.tick;
  const resetFrame = await next(observer,m => m.data.tick > resetTick + 5);
  for (const peer of [tank,dps]) {
    const reset = entity(resetFrame,peer.player);
    assert.equal(reset.player_mask & 32,32,'server acknowledges the real reset input');
    assert.equal(reset.guard.remaining_s,0,'reset ends temporary guard time');
    assert.equal(reset.guard.shield_hp,peer===tank?500:0,'the tank keeps its pool while the temporary personal guard ends');
    assert(reset.guard.cooldown_s > 10,'reset retains the simulation cooldown');
  }
  tank.control.playerMask = 0; dps.control.playerMask = 0;
  await reject(tank,'tank_barrier',{},/cooling down/); await reject(dps,'dps_guard_boost',{},/cooling down/);
  checks.push('Tank barrier replicates 500HP with a fifteen-second recast cooldown, costs 1L and no NOS; repeated RPCs and normal reset input cannot erase either hero cooldown');

  phase = 'authenticated reconnect preserves cooldown';
  for (const original of [tank,dps]) {
    const identity = original.identity;
    await original.disconnect();
    const resumed = await new Peer().ready(); peers.push(resumed);
    const restored = await resumed.command('identify',{name:'Support restored '+original.hero,token:identity.token}); assert.equal(restored.profile_id,identity.profile_id);
    const state = (await resumed.wait(m => m.type === 'social_state' && m.data.alpha?.active?.hero === original.hero)).data;
    assert.equal(state.alpha.active.world_id,world); assert.equal(state.alpha.active.team,'red');
    await resumed.deploy(original.vehicle);
    await reject(resumed,original.hero === 'tank' ? 'tank_barrier' : 'dps_guard_boost',{},/cooling down/);
  }
  checks.push('Real token reconnect and repeated deployment preserve each ability profile cooldown and the selected hero/team');
  limits.push('No production enemy was moved into firing range or artificially injured: this WebSocket regression proves DPS shot emission and rejected/no-need healing. Actual enemy damage, positive pack arrival/HP/ultimate gain and obstruction/death/overheal cases are covered by the focused Rust healing/guard tests and existing vehicle-health socket test.');
  console.log(JSON.stringify({checks,limits,failures:0},null,2));
} finally {
  clearInterval(inputTimer);
  for (const peer of peers) peer.close(); server.kill();
  await new Promise(resolve => {if (server.exitCode !== null) resolve(); else server.once('exit',resolve);});
  fs.rmSync(directory,{recursive:true,force:true});
}
