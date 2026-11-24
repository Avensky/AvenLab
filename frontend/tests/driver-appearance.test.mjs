import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {driverAppearance, isDriverAppearance} from '../src/game/characters/driverAppearance.ts';
import {decodeCompactSnapshot} from '../src/net/compactSnapshot.ts';
import {SnapshotDecoder} from '../src/net/snapshotDecoder.ts';

const cases=JSON.parse(fs.readFileSync(new URL('./fixtures/driver-appearance.json',import.meta.url),'utf8'));
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/compact-snapshot-v3.json',import.meta.url),'utf8'));

test('equipped profiles reduce to the shared server silhouette contract',()=>{
 for(const item of cases){assert.deepEqual(driverAppearance(item.choice),item.driver,item.name);assert(isDriverAppearance(item.driver));}
 assert.equal(driverAppearance(null),null);
 assert.equal(driverAppearance({id:'missing',outfit:'missing'}),null);
});

test('driver payload validates finite enumerations and literal RGB colors',()=>{
 const base=cases[0].driver;
 for(const patch of [{body:'other'},{hairStyle:'detailed'},{headwear:'crown'},{skin:'red'},{top:'url(texture)'},{hair:null},{bottom:'#fff'},{headwearColor:12}]){
  assert(!isDriverAppearance({...base,...patch}));
 }
 for(const item of [null,[],{},false,'driver'])assert(!isDriverAppearance(item));
});

test('v3 preserves exact physics and carries only occupied driver appearances',()=>{
 assert.deepEqual(decodeCompactSnapshot(fixture.compact),fixture.legacy);
 const decoder=new SnapshotDecoder();
 assert.deepEqual(decoder.decode(fixture.keyframe),fixture.legacy);
 assert.deepEqual(decoder.decode(fixture.delta),fixture.updated);
 assert.deepEqual(decoder.decode(fixture.return_delta),fixture.returned);
 assert.equal(fixture.compact.data[3][1][35],null);
 assert(!('driver' in decoder.decode(fixture.keyframe).data.entities[1]));
});

test('appearance changes use one delta field and never contaminate the keyframe or another car',()=>{
 const decoder=new SnapshotDecoder(),before=JSON.stringify(fixture.keyframe),next=cases[2].driver;
 decoder.decode(fixture.keyframe);
 const packet={...fixture.delta,patch:[1,8,0,[1,1,0,[1,0,8,[0,next]]]]};
 const updated=decoder.decode(packet);
 assert.deepEqual(updated.data.entities[0].driver,next);
 assert(!('driver' in updated.data.entities[1]));
 assert.equal(JSON.stringify(fixture.keyframe),before);
 assert.deepEqual(decoder.decode({...packet,patch:null}),fixture.legacy);
 assert(!JSON.stringify(packet).includes('wardrobe'));
 const invalid=structuredClone(fixture.compact);invalid.data[3][0][35].skin='invalid';
 assert.equal(decodeCompactSnapshot(invalid),null);
});
