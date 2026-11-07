import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeCompactSnapshot} from '../src/net/compactSnapshot.ts';
import {SnapshotDecoder} from '../src/net/snapshotDecoder.ts';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/compact-snapshot.json',import.meta.url),'utf8'));

test('production Rust compact fixture restores every field and exact numeric value',()=>{
 assert.deepEqual(decodeCompactSnapshot(fixture.compact),fixture.legacy);
 assert(JSON.stringify(fixture.compact).length<JSON.stringify(fixture.legacy).length*.65);
 // Each complete packet can decode independently after a lost update.
 assert.deepEqual(decodeCompactSnapshot(structuredClone(fixture.compact)),fixture.legacy);
});

test('masked updates are exact, immutable and recover after skipped updates',()=>{
 const decoder=new SnapshotDecoder(), original=JSON.stringify(fixture.keyframe);
 assert.deepEqual(decoder.decode(fixture.keyframe),fixture.legacy);
 assert.deepEqual(decoder.decode(fixture.delta),fixture.updated);
 assert.deepEqual(decoder.decode(fixture.return_delta),fixture.returned);
 assert.equal(JSON.stringify(fixture.keyframe),original,'decoding must not modify the shared baseline');
 const skipped=new SnapshotDecoder(); skipped.decode(fixture.keyframe);
 assert.deepEqual(skipped.decode(fixture.return_delta),fixture.returned);
 assert.deepEqual(skipped.decode(fixture.delta),fixture.updated,'each delta rebuilds from the baseline, not the last arrival');
});

test('missing baselines and corrupt masks request one resync and recover',()=>{
 const decoder=new SnapshotDecoder();
 assert.equal(decoder.decode(fixture.delta),null); assert(decoder.takeResyncRequest());
 assert.equal(decoder.decode(fixture.delta),null); assert(!decoder.takeResyncRequest());
 assert.deepEqual(decoder.decode(fixture.keyframe),fixture.legacy);
 assert.deepEqual(decoder.decode(fixture.delta),fixture.updated);
 for(const patch of [[1,0x80000000,0,[0,1]],[1,0,0,[0,1]],[1,-1,0],[2,{unknown:[0,1]}],[8]]) {
  decoder.decode(fixture.keyframe);
  assert.equal(decoder.decode({...fixture.delta,patch}),null);assert(decoder.takeResyncRequest());
 }
 decoder.decode(fixture.keyframe);
 assert.equal(decoder.decode({...fixture.delta,world_id:fixture.delta.world_id+1}),null);
 decoder.decode(fixture.keyframe);
 assert.equal(decoder.decode({...fixture.delta,base_id:fixture.delta.base_id+1}),null);
 decoder.reset();assert.equal(decoder.decode(fixture.delta),null);assert(decoder.takeResyncRequest());
});

test('boolean masks cover health, weapon controls and grounded wheels',()=>{
 for(let flags=0;flags<64;flags++) {
  const wire=structuredClone(fixture.compact);wire.data[3][0][33]=flags;wire.data[3][0][34]=5;
  const entity=decodeCompactSnapshot(wire).data.entities[0];
  assert.equal(entity.health.defeated,Boolean(flags&1));
  for(const [i,key] of ['enabled','fire','hull_locked','ram','impact_static'].entries())assert.equal(entity.combat[key],Boolean(flags&(2<<i)));
  assert.deepEqual(entity.wheels.map(w=>w.grounded),[true,false,true,false]);
 }
 for(const invalid of [-1,64,NaN]) {
  const wire=structuredClone(fixture.compact);wire.data[3][0][33]=invalid;assert.equal(decodeCompactSnapshot(wire),null);
 }
});

test('unknown versions and malformed tuples never reach game stores',()=>{
 for(const value of [null,{}, {...fixture.compact,version:99}, {...fixture.compact,world_id:1.5}, {...fixture.compact,data:[]}, {...fixture.compact,data:[0,0,0,{}]}]) assert.equal(decodeCompactSnapshot(value),null);
 const corrupt=structuredClone(fixture.compact);corrupt.data[3][0].pop();assert.equal(decodeCompactSnapshot(corrupt),null);
 const wheel=structuredClone(fixture.compact);wheel.data[3][0][26][0].pop();assert.equal(decodeCompactSnapshot(wheel),null);
 const decoded=decodeCompactSnapshot(fixture.compact);
 assert(!('assisted_target' in decoded.data.entities[1].combat));
 assert(!('panel' in decoded.data.entities[1].guard));
 assert(!('barrage' in decoded.data.entities[1]));
});

test('private readings are world scoped, validated and projected only onto their owner',()=>{
 const decoder=new SnapshotDecoder(),key=structuredClone(fixture.keyframe);
 for(const row of key.data[3])for(const index of [10,11,12,17,18,19,20,24])row[index]=null;
 const packet={type:'driver',world_id:key.world_id,data:[17,100,3,.5,null,12.25,85.5,124]};
 assert(!decoder.receiveDriver({...packet,data:[17]}));
 assert(decoder.receiveDriver(packet));
 const [self,peer]=decoder.decode(key,'alpha').data.entities;
 assert.equal(self.last_input_seq,17);assert.equal(self.fuel,12.25);assert.equal(self.cabin_mask,3);
 assert(!('fuel' in peer));assert(!('last_input_seq' in peer));assert(!('cruise_target_kph' in peer));
 decoder.reset();assert(!('fuel' in decoder.decode(key,'alpha').data.entities[0]));
 decoder.receiveDriver({...packet,world_id:99});assert(!('fuel' in decoder.decode(key,'alpha').data.entities[0]));
});

test('v1 remains decodable and v2 carries authoritative tire contact effects',()=>{
 const old=JSON.parse(fs.readFileSync(new URL('./fixtures/compact-snapshot-v1.json',import.meta.url),'utf8'));
 assert.deepEqual(decodeCompactSnapshot(old.compact),old.legacy);
 const decoder=new SnapshotDecoder();assert.deepEqual(decoder.decode(old.keyframe),old.legacy);assert.deepEqual(decoder.decode(old.delta),old.updated);
 const next=structuredClone(fixture.compact);assert.equal(next.version,2);
 next.data[3][0][26][0][6]=[1,2,3,0,1,0,.8];
 assert.deepEqual(decodeCompactSnapshot(next).data.entities[0].wheels[0].tire_contact,[1,2,3,0,1,0,.8]);
 decoder.decode(fixture.keyframe);assert.equal(decoder.decode({...fixture.delta,version:1}),null);
});
