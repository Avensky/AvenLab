/** Disposable production server and bounded WebSocket peers for live audits. */
import assert from 'node:assert/strict';
import {SnapshotDecoder} from '../../frontend/src/net/snapshotDecoder.ts';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export async function startTestServer(options = {}) {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const binary = process.env.AVENLAB_SERVER_BIN ?? path.join(repo, 'avenlab-server/target/debug', process.platform === 'win32' ? 'avenlab-server.exe' : 'avenlab-server');
  if (!fs.existsSync(binary)) throw Error('Build Rust first or set AVENLAB_SERVER_BIN.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'avenlab-live-audit-'));
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(binary, [], {
    cwd: path.join(repo, 'avenlab-server'),
    env: {...process.env, AVENLAB_BIND: '127.0.0.1:' + port, AVENLAB_SOCIAL_PATH: path.join(directory, 'social.json'), ...options},
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => output = (output + bytes).slice(-24000));
  let phase = 'startup';
  const test = {get phase(){return phase;}, set phase(value){phase=value;console.error('[live audit] '+value);},
    peers: [], port, child, output: () => output};
  const exit = new Promise(resolve => child.once('exit', resolve));
  test.close = async () => {
    for (const peer of test.peers) peer.close();
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exit;
    fs.rmSync(directory, {recursive: true, force: true});
  };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Server startup timed out: ' + output.slice(-1600))), 15000);
      child.stdout.on('data', bytes => {if (bytes.toString().includes('WebSocket listening')) {clearTimeout(timer); resolve();}});
      child.once('error', error => {clearTimeout(timer); reject(error);});
      child.once('exit', code => {clearTimeout(timer); reject(Error('Server exited: ' + code));});
    });
  } catch (error) {
    if (child.pid) await test.close();
    else fs.rmSync(directory, {recursive: true, force: true});
    throw error;
  }
  class Peer {
    constructor(compact) {
      this.compact = compact; this.compactFrames = 0; this.decoder=new SnapshotDecoder();
      this.serial = 0; this.messages = []; this.waiters = []; this.view = null;
      this.socket = new WebSocket('ws://127.0.0.1:' + port);
      this.closed = new Promise(resolve => this.socket.addEventListener('close', resolve, {once: true}));
      this.socket.addEventListener('error', () => {});
      this.socket.addEventListener('message', event => {
        let message = JSON.parse(event.data);
        this.lastWireType=message.type;
        if(message.type==='world_changed')this.decoder.reset();
        if(message.type==='driver') {
          assert(this.decoder.receiveDriver(message));
          this.driverBytes=(this.driverBytes??0)+Buffer.byteLength(event.data);
        }
        if (message.type === 'snapshot_delta' && this.dropNextDelta > 0) {this.dropNextDelta--; return;}
        if (message.type === 'snapshot_compact' || message.type === 'snapshot_delta') {
          message = this.decoder.decode(message,this.player);
          if (!message) {
            assert(this.allowResync, 'Production compact snapshot failed to decode');
            if (this.decoder.takeResyncRequest()) {
              this.resyncRequests=(this.resyncRequests??0)+1;
              this.socket.send(JSON.stringify({type:'snapshot_format',version:1}));
            }
            return;
          }
          this.compactFrames++;
        }
        // Never keep hundreds of full ten-vehicle snapshots in the test driver.
        if (message.type === 'snapshot') this.messages = this.messages.filter(m => m.type !== 'snapshot');
        this.messages.push(message);
        if (this.messages.length > 128) this.messages.shift();
        if (message.type === 'social_state') this.view = message.data;
        this.observe?.(message, event.data);
        for (const waiter of [...this.waiters]) if (waiter.test(message)) {
          clearTimeout(waiter.timer); this.waiters.splice(this.waiters.indexOf(waiter), 1); waiter.resolve(message);
        }
      });
    }
    wait(predicate, fresh = false, timeout = 22000) {
      if (!fresh) {const found = this.messages.findLast(predicate); if (found) return Promise.resolve(found);}
      return new Promise((resolve, reject) => {
        const waiter = {test: predicate, resolve, timer: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(Error('Timed out in ' + test.phase + '; state=' + JSON.stringify(this.view?.alpha) + '; server=' + output.slice(-1800)));
        }, timeout)};
        this.waiters.push(waiter);
      });
    }
    async ready(name) {
      const welcome = await this.wait(m => m.type === 'welcome');
      this.player = welcome.player_id;
      if (this.compact && welcome.compact_snapshot_version === 1)
        this.socket.send(JSON.stringify({type:'snapshot_format',version:1}));
      if (name) this.identity = await this.command('identify', {name});
      return this;
    }
    async request(action, fields = {}) {
      const request_id = 'live-' + ++this.serial;
      const reply = this.wait(m => m.type === 'social_result' && m.request_id === request_id, true);
      this.socket.send(JSON.stringify({type: 'social_request', action, request_id, ...fields}));
      return reply;
    }
    async command(action, fields = {}) {const reply = await this.request(action, fields); assert(reply.ok, reply.message); return reply.data;}
    async active(predicate = () => true) {
      return (await this.wait(m => m.type === 'social_state' && m.data.alpha?.active && predicate(m.data.alpha.active))).data.alpha.active;
    }
    async deploy(vehicle) {
      const reply = this.wait(m => m.type === 'spawn_ready' || m.type === 'spawn_error', true);
      this.socket.send(JSON.stringify({type: 'spawn_request', map: 'streaming_endless_city', vehicle}));
      const result = await reply; assert.equal(result.type, 'spawn_ready', result.message); return result;
    }
    async disconnect() {this.socket.close(); await this.closed;}
    close() {for (const waiter of this.waiters) clearTimeout(waiter.timer); this.waiters = []; this.socket.close();}
  }
  test.newPeer = async (name, compact = process.env.AVENLAB_SNAPSHOT_VERSION !== '0') => {
    const peer = new Peer(compact); test.peers.push(peer); await peer.ready(name); return peer;
  };
  test.join = async (peer, mode, teamSize) => {
    const result = await peer.command('mode_join', {mode, team_size: teamSize, hero: ''});
    assert.equal(result.team_size, teamSize); assert.equal(result.mode, mode); return result;
  };
  return test;
}
