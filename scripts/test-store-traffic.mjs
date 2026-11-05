/** Lobby traffic through real sockets; AVENLAB_SERVER_BIN selects the release build. */
import assert from 'node:assert/strict';
import {startTestServer} from './lib/live-match-server.mjs';

const test = await startTestServer();
try {
  const peers = [];
  for (let i = 0; i < 20; i++) peers.push(await test.newPeer('Store audit ' + i));
  await peers[0].command('refresh');
  const socials = Array(20).fill(0);
  peers.forEach((peer, index) => {
    peer.observe = message => { if (message.type === 'social_state') socials[index]++; };
  });
  const timings = {};
  for (const action of ['refresh', 'career_history']) {
    const elapsed = [];
    for (let i = 0; i < 60; i++) {
      const started = performance.now();
      await peers[i % peers.length].command(action);
      elapsed.push(performance.now() - started);
    }
    elapsed.sort((a, b) => a - b);
    timings[action] = {requests: elapsed.length, p50_ms: elapsed[29], p95_ms: elapsed[56]};
  }
  // A fresh mutation must still reach an unrelated observer.
  const visible = peers[1].wait(m => m.type === 'social_state' && m.data.worlds.some(w => w.name === 'Audit range'), true);
  const quietPackets = socials.reduce((sum, n) => sum + n, 0);
  assert.equal(quietPackets, 0);
  await peers[0].command('world_create', {name:'Audit range',map:'road_precision',listed:true,max_players:10});
  const row = (await visible).data.worlds.find(w => w.name === 'Audit range');
  assert.equal(row.invite_code, null);
  assert.deepEqual(row.members, []);
  console.log(JSON.stringify({clients:20, unchanged_social_packets:quietPackets, timings, mutation_seen:true}, null, 2));
} finally { await test.close(); }
