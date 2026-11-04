#!/usr/bin/env node
/** Two real local WebSocket clients, one disposable server/profile file.
 * Run after cargo build. Never uses a running user server or modifies map assets. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binary = process.env.AVENLAB_SERVER_BIN ?? path.join(repo, 'avenlab-server/target/debug', process.platform === 'win32' ? 'avenlab-server.exe' : 'avenlab-server');
if (!fs.existsSync(binary)) throw Error('Build Rust first: cargo build --manifest-path avenlab-server/Cargo.toml');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'avenlab-health-e2e-'));
const reservation = net.createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const server = spawn(binary, [], {
  cwd: path.join(repo, 'avenlab-server'),
  env: {
    ...process.env,
    AVENLAB_BIND: `127.0.0.1:${port}`,
    AVENLAB_SOCIAL_PATH: path.join(directory, 'social.json'),
    AVENLAB_ALPHA_LIMITS: '0',
    AVENLAB_MAX_ACTIVE_WORLDS: '2',
    AVENLAB_MAX_PLAYERS: '10'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '',
  phase = 'startup',
  inputTimer;
const peers = [],
  checks = [];
for (const stream of [server.stdout, server.stderr]) stream.on('data', bytes => output = (output + bytes.toString()).slice(-16000));
const started = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('Server startup timed out. ' + output)), 15000);
  server.stdout.on('data', bytes => {
    if (bytes.toString().includes('WebSocket listening')) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.once('error', reject);
  server.once('exit', code => {
    clearTimeout(timer);
    if (code) reject(Error('Server exited: ' + code + ' ' + output));
  });
});
const entity = (frame, id) => frame?.data?.entities?.find(value => value.id === id);
class Peer {
  constructor() {
    this.messages = [];
    this.waiters = [];
    this.serial = 0;
    this.sequence = 0;
    this.latest = null;
    this.control = {
      throttle: 0,
      steer: 0,
      brake: 1,
      handbrake: 0,
      vehicleMask: 1,
      playerMask: 0,
      combat: {
        enabled: true,
        fire: false,
        weapon: 'coax',
        yaw: Math.PI,
        pitch: 0,
        hull_locked: false,
        ram: false,
        role: 'assault',
        x: 0,
        y: 1.1,
        z: 0
      }
    };
    this.socket = new WebSocket(`ws://127.0.0.1:${port}`);
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      this.messages.push(message);
      if (this.messages.length > 240) this.messages.shift();
      if (message.type === 'snapshot') this.latest = message;
      for (const waiter of [...this.waiters]) if (waiter.predicate(message)) {
        clearTimeout(waiter.timer);
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    });
  }
  wait(predicate, fresh = false) {
    if (!fresh) {
      const found = this.messages.findLast(predicate);
      if (found) return Promise.resolve(found);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(Error('Timed out in ' + phase + '; latest ' + JSON.stringify(this.latest?.data?.entities?.map(e => ({
            id: e.id,
            vehicle: e.vehicle_id,
            team: e.team,
            position: e.position,
            health: e.health,
            combat: e.combat
          }))) + '; server ' + output.slice(-1200)));
        }, 18000)
      };
      this.waiters.push(waiter);
    });
  }
  async ready(name) {
    const welcome = await this.wait(m => m.type === 'welcome');
    this.player = welcome.player_id;
    await this.social('identify', {
      name
    });
    return this;
  }
  async social(action, fields = {}) {
    const request_id = 'health-' + ++this.serial,
      response = this.wait(m => m.type === 'social_result' && m.request_id === request_id, true);
    this.socket.send(JSON.stringify({
      type: 'social_request',
      action,
      request_id,
      ...fields
    }));
    const result = await response;
    assert(result.ok, result.message);
    return result.data;
  }
  async transport(type, fields, responses) {
    const request_id = 'health-' + ++this.serial,
      response = this.wait(m => responses.includes(m.type) && m.request_id === request_id, true);
    this.socket.send(JSON.stringify({
      type,
      request_id,
      ...fields
    }));
    return response;
  }
  async spawn(vehicle) {
    const response = this.wait(m => m.type === 'spawn_ready' || m.type === 'spawn_error', true);
    this.socket.send(JSON.stringify({
      type: 'spawn_request',
      map: 'road_jump_lab',
      vehicle,
      mode: 'sandbox'
    }));
    const result = await response;
    assert.equal(result.type, 'spawn_ready', result.message);
    return result;
  }
  tick() {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({
      type: 'input',
      seq: ++this.sequence,
      dt: 1 / 60,
      ...this.control
    }));
  }
  close() {
    for (const waiter of this.waiters) clearTimeout(waiter.timer);
    this.waiters = [];
    this.socket.close();
  }
}
// Same roof-MG model offset used by the server; iterative aim points the real
// ray toward the other replicated chassis rather than teleporting either player.
const rotate = (q, v) => {
  const [x, y, z, w] = q,
    [vx, vy, vz] = v,
    tx = 2 * (y * vz - z * vy),
    ty = 2 * (z * vx - x * vz),
    tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + y * tz - z * ty, vy + w * ty + z * tx - x * tz, vz + w * tz + x * ty - y * tx];
};
function aim(attacker, victim) {
  const q = attacker.rotation,
    targetOffset = rotate(victim.rotation, victim.collider?.chassis_offset ?? [0, 0, 0]),
    target = victim.position.map((v, i) => v + targetOffset[i]);
  let origin = [...attacker.position],
    direction = [0, 0, 1];
  for (let i = 0; i < 5; i++) {
    const delta = target.map((v, k) => v - origin[k]),
      length = Math.hypot(...delta);
    direction = delta.map(v => v / length);
    const local = rotate([-q[0], -q[1], -q[2], q[3]], direction),
      yaw = Math.atan2(local[0], local[2]),
      visualY = (attacker.combat?.y ?? 1.65) - 1.65;
    const offset = rotate(q, [-.505 * Math.cos(yaw) + 1.341 * Math.sin(yaw), visualY + 2.2, .1 + .505 * Math.sin(yaw) + 1.341 * Math.cos(yaw)]);
    origin = attacker.position.map((v, k) => v + offset[k]);
  }
  return {
    yaw: Math.atan2(-direction[0], -direction[2]),
    pitch: Math.asin(direction[1])
  };
}
try {
  await started;
  const a = await new Peer().ready('Health attacker');
  peers.push(a);
  const world = (await a.social('world_create', {
    name: 'Health range',
    map: 'road_jump_lab',
    listed: true,
    max_players: 2
  })).world_id;
  await a.social('world_join', {
    world_id: world
  });
  await a.spawn('tank');
  const b = await new Peer().ready('Health victim');
  peers.push(b);
  await b.social('world_join', {
    world_id: world
  });
  await b.spawn('brz');
  inputTimer = setInterval(() => {
    const own = entity(a.latest, a.player),
      target = entity(a.latest, b.player);
    if (own && target) Object.assign(a.control.combat, aim(own, target));
    for (const peer of peers) peer.tick();
  }, 16);
  phase = 'spawn/protection';
  const first = await a.wait(m => m.type === 'snapshot' && entity(m, a.player)?.health && entity(m, b.player)?.health);
  assert.notEqual(entity(first, a.player).team, entity(first, b.player).team);
  assert.equal(entity(first, a.player).health.max_hp, 1200);
  assert.equal(entity(first, b.player).health.max_hp, 500);
  assert(entity(first, b.player).health.spawn_protection_s > 0);
  checks.push('Two enemy clients receive distinct server HP capacities and initial spawn protection');
  const initialStats=entity(first,a.player).health.stats;
  assert(initialStats&&Object.values(initialStats).every(value=>Number.isFinite(value)&&value>=0));
  assert.equal(initialStats.resurrections,0);
  a.control.health={stats:{damage_dealt:999999,healing_done:999999,assists:999,gas_gained_liters:999999}};

  const armed = await a.wait(m => m.type === 'snapshot' && m.data.tick > first.data.tick && entity(m, b.player)?.health.spawn_protection_s === 0 && entity(m, a.player)?.combat.enabled);
  phase = 'real MG damage';
  a.control.combat.fire = true;
  const damaged = await a.wait(m => m.type === 'snapshot' && m.data.tick > armed.data.tick && entity(m, b.player)?.health.hp < 500 && !entity(m, b.player)?.health.defeated);
  const victimHp = entity(damaged, b.player).health;
  assert.equal(victimHp.last_attacker, a.player);
  assert.equal(victimHp.last_damage_kind, 'machine-gun');
  assert(victimHp.damage_seq > 0);
  await b.wait(m => m.type === 'snapshot' && m.data.tick >= damaged.data.tick && entity(m, b.player)?.health.damage_seq >= victimHp.damage_seq);
  checks.push('Real MG rays reduce enemy HP and attribution replicates to both clients');
  phase = 'defeat';
  const death = await a.wait(m => m.type === 'snapshot' && m.data.tick > damaged.data.tick && entity(m, b.player)?.health.defeated);
  const dead = entity(death, b.player);
  assert.equal(dead.health.hp, 0);
  assert.equal(dead.health.deaths, 1);
  assert(dead.health.respawn_remaining_s > 11);
  assert.equal(entity(death, a.player).health.kills, 1);
  await b.wait(m => m.type === 'snapshot' && m.data.tick >= death.data.tick && entity(m, b.player)?.health.defeated);
  checks.push('Lethal damage produces one server defeat, kill credit and twelve-second mechanic recovery countdown');
  const scored=entity(death,a.player).health.stats;
  assert.equal(scored.damage_dealt,500,'score counts actual HP, including the final partial MG hit');
  assert.equal(scored.healing_done,0);assert.equal(scored.self_healing,0);assert.equal(scored.assists,0);
  assert.equal(scored.gas_gained_liters,0,'forged browser stats are ignored');
  assert(scored.gas_burned_liters>0,'real engine fuel use is replicated');
  assert.equal(dead.health.stats.respawns,0);assert.equal(dead.health.stats.resurrections,0);
  checks.push('Session damage is actual 500 HP, engine fuel is measured, and browser-authored stats cannot grant score');

  phase = 'defeat bypass rejection';
  b.control.playerMask = 32;
  b.control.throttle = 1;
  b.control.brake = 0;
  b.control.combat.fire = true;
  b.control.combat.ram = true;
  const change = await b.transport('change_vehicle_request', {
    vehicle: 'tank'
  }, ['vehicle_changed', 'vehicle_change_error']);
  assert.equal(change.type, 'vehicle_change_error');
  const repeatSpawn = await b.spawn('tank');
  assert.equal(repeatSpawn.newly_spawned, false);
  const denied = await a.wait(m => m.type === 'snapshot' && m.data.tick > death.data.tick + 20 && entity(m, b.player)?.health.defeated);
  const blocked = entity(denied, b.player);
  assert.equal(blocked.vehicle_id, 'brz');
  assert.equal(blocked.health.hp, 0);
  assert.equal(blocked.health.deaths, 1);
  assert.equal(entity(denied, a.player).health.kills, 1);
  assert.equal(blocked.combat.fire, false);
  assert.equal(blocked.combat.ram_remaining, 0);
  assert(Math.hypot(...blocked.position.map((v, i) => v - dead.position[i])) < 1);
  b.control.playerMask = 0;
  b.control.throttle = 0;
  b.control.brake = 1;
  b.control.combat.fire = false;
  b.control.combat.ram = false;
  checks.push('Dead reset/drive/fire/Ram/vehicle-change/repeated-spawn requests cannot revive or heal; repeat hits cannot duplicate kill credit');
  phase = 'automatic respawn';
  const respawn = await b.wait(m => m.type === 'snapshot' && m.data.tick > denied.data.tick && entity(m, b.player)?.health.defeated === false && entity(m, b.player)?.health.spawn_protection_s > 1);
  const revived = entity(respawn, b.player);
  assert.equal(revived.health.hp, 500);
  assert.equal(revived.health.deaths, 1);
  assert.equal(revived.health.respawn_remaining_s, 0);
  const observerRespawn = await a.wait(m => m.type === 'snapshot' && m.data.tick >= respawn.data.tick && entity(m, b.player)?.health.defeated === false && entity(m, b.player)?.health.spawn_protection_s > 0);
  assert.equal(entity(observerRespawn, b.player).health.hp, 500);
  assert.equal(entity(observerRespawn, a.player).health.kills, 1);
  checks.push('Automatic nearest safe recovery and its fresh shield replicate to both clients while preserving score');
  assert.equal(revived.health.stats.respawns,1);
  assert.equal(revived.health.stats.resurrections,0,'normal recovery never pretends a teammate resurrection occurred');
  assert.equal(revived.health.stats.gas_gained_liters,0,'respawn factory fuel is excluded from supply totals');
  assert.equal(entity(observerRespawn,a.player).health.stats.damage_dealt,500);
  checks.push('Server respawn preserves damage totals and counts separately from mechanic resurrections');

  phase = 'protection under continued enemy fire';
  const protectedFrame = await a.wait(m => m.type === 'snapshot' && m.data.tick > respawn.data.tick + 30 && entity(m, b.player)?.health.spawn_protection_s > 0);
  assert.equal(entity(protectedFrame, b.player).health.hp, 500);
  assert.equal(entity(protectedFrame, b.player).health.damage_seq, dead.health.damage_seq);
  checks.push('Continued enemy fire cannot damage the respawned vehicle during protection');
  assert.equal(entity(protectedFrame,a.player).health.stats.damage_dealt,500,'protected hits cannot farm damage score');

  phase = 'protection expiry';
  const vulnerable = await b.wait(m => m.type === 'snapshot' && m.data.tick > protectedFrame.data.tick && entity(m, b.player)?.health.hp < 500 && !entity(m, b.player)?.health.defeated);
  a.control.combat.fire = false;
  assert.equal(entity(vulnerable, b.player).health.spawn_protection_s, 0);
  assert.equal(entity(vulnerable, b.player).health.deaths, 1);
  checks.push('The shield expires and real enemy damage resumes without another death or kill credit');
  assert(entity(vulnerable,a.player).health.stats.damage_dealt>500);
  assert.equal(entity(vulnerable,b.player).health.stats.respawns,1);

  console.log(JSON.stringify({
    checks,
    failures: 0
  }, null, 2));
} finally {
  if (inputTimer) clearInterval(inputTimer);
  for (const peer of peers) peer.close();
  server.kill();
  await new Promise(resolve => {
    if (server.exitCode !== null) resolve();else server.once('exit', resolve);
  });
  fs.rmSync(directory, {
    recursive: true,
    force: true
  });
}
