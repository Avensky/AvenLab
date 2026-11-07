import test from 'node:test';
import assert from 'node:assert/strict';
import {SnapshotDelivery} from '../src/net/snapshotDelivery.ts';

function fixture() {
  let next = 0;
  const callbacks = new Map(), published = [];
  const delivery = new SnapshotDelivery(receipt => published.push(receipt), {
    request(callback) { callbacks.set(++next, callback); return next; },
    cancel(handle) { callbacks.delete(handle); },
  });
  const render = () => {
    const ready = [...callbacks.values()];
    callbacks.clear();
    for (const callback of ready) callback();
  };
  return {delivery, callbacks, published, render};
}

test('a post-stall packet burst keeps one pending snapshot and one subscriber publication', () => {
  const {delivery, callbacks, published, render} = fixture();
  delivery.offer({tick:0}, 100);
  assert.deepEqual(published, [{snapshot:{tick:0}, receivedMs:100}], 'first pose is immediate');
  for (let tick=1; tick<=600; tick++) delivery.offer({tick}, 100+tick);
  assert.equal(callbacks.size, 1, 'never schedules a render task per packet');
  assert.equal(published.length, 1, 'does not replay hundreds of obsolete UI states');
  assert.equal(delivery.coalesced, 599);
  render();
  assert.equal(callbacks.size, 0);
  assert.deepEqual(published.at(-1), {snapshot:{tick:600}, receivedMs:700});
  assert.equal(published.length, 2);
  delivery.offer({tick:601}, 733);
  render();
  assert.deepEqual(published.at(-1), {snapshot:{tick:601}, receivedMs:733});
});

test('duplicate or reordered packets cannot replace a newer not-yet-published pose', () => {
  const {delivery, published, render} = fixture();
  delivery.offer({tick:1}, 0);
  delivery.offer({tick:5}, 100);
  for (const tick of [2,4,5,-1,1.5,NaN,Infinity]) assert.equal(delivery.offer({tick}, 101), false);
  assert.equal(delivery.offer({tick:6}, NaN), false);
  render();
  assert.deepEqual(published.map(p=>p.snapshot.tick), [1,5]);
  assert.equal(delivery.coalesced, 0);
});

test('lifecycle boundaries publish immediately and supersede queued movement', () => {
  const {delivery, callbacks, published, render} = fixture();
  delivery.offer({tick:1, defeated:false}, 10);
  delivery.offer({tick:2, defeated:false}, 20);
  const staleCallback = [...callbacks.values()][0];
  delivery.offer({tick:3, defeated:true}, 30, true);
  assert.equal(callbacks.size, 0);
  assert.deepEqual(published.map(p=>p.snapshot.tick), [1,3]);
  delivery.offer({tick:4, defeated:true}, 40);
  staleCallback();
  assert.equal(published.at(-1).snapshot.tick, 3, 'cancelled callbacks cannot publish a subsequent frame');
  render();
  assert.equal(published.at(-1).snapshot.tick, 4);
});

test('world reset cancels old delivery, permits tick zero, and isolates already-ready callbacks', () => {
  const {delivery, callbacks, published, render} = fixture();
  delivery.offer({tick:800, world:1}, 1000);
  delivery.offer({tick:801, world:1}, 1033);
  const staleCallback = [...callbacks.values()][0];
  delivery.reset();
  assert.equal(callbacks.size, 0);
  delivery.offer({tick:0, world:2}, 1100);
  delivery.offer({tick:1, world:2}, 1133);
  staleCallback();
  assert.deepEqual(published.map(p=>[p.snapshot.world,p.snapshot.tick]), [[1,800],[2,0]]);
  render();
  assert.deepEqual(published.at(-1), {snapshot:{tick:1,world:2}, receivedMs:1133});
  delivery.offer({tick:2, world:2}, 1166);
  delivery.reset();
  render();
  assert.equal(published.at(-1).snapshot.tick, 1, 'disconnect cannot repopulate a cleared session');
});
