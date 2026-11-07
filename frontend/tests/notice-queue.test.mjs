import assert from 'node:assert/strict';
import test from 'node:test';
import {enqueueNotice,pruneNotices,NOTICE_CAPACITY,NOTICE_LIFETIME_MS} from '../src/combat/noticeQueue.ts';
import {vehicleNoticeSignals,vehicleNoticeTransitions} from '../src/combat/vehicleNoticeSignals.ts';
import {VehicleFlags} from '../src/store/input/protocol/inputMasks.ts';

const notice=(id,text=String(id),created=100,session='one')=>({id,text,created,session,tone:'system',channel:'system'});
test('bounded queue deduplicates without store churn, preserving the slots of surviving lines',()=>{
  let lines=[];
  for(let i=0;i<3;i++)lines=enqueueNotice(lines,notice(i),100);
  assert.equal(lines.length,NOTICE_CAPACITY);assert.deepEqual(lines.map(line=>line.slot),[0,1,2]);
  assert.equal(enqueueNotice(lines,notice(4,'2'),150),lines,'duplicates never restart an animation');
  assert.equal(pruneNotices(lines,150,'one'),lines,'idle expiry does not redraw');
  const kept=lines.slice(1);lines=enqueueNotice(lines,notice(4,'new',200),200);
  assert.equal(lines.length,NOTICE_CAPACITY);assert.equal(lines[0],kept[0]);assert.equal(lines[1],kept[1]);
  assert.deepEqual(lines.map(line=>line.slot),[1,2,0]);
  assert.deepEqual(pruneNotices(lines,100+NOTICE_LIFETIME_MS),[lines[2]],'expiry never shifts surviving slots');
  assert.equal(pruneNotices(lines,200+NOTICE_LIFETIME_MS).length,0);
});
test('new worlds discard old notices and stalled or future events cannot enter the queue',()=>{
  const old=enqueueNotice([],notice(1),100);
  const next=enqueueNotice(old,notice(2,'fresh',200,'two'),200);
  assert.deepEqual(next.map(line=>line.session),['two']);
  assert.deepEqual(enqueueNotice([],notice(3,'old',100),1200),[]);
  assert.deepEqual(enqueueNotice([],notice(4,'future',1300),1200),[]);
  assert.deepEqual(enqueueNotice([],notice(4,'   ',1200),1200),[]);
});
const signals=(health={},extra={})=>vehicleNoticeSignals({vehicle_id:'camaro',vehicle_mask:0,health:{defeated:false,spawn_protection_s:0,...health},...extra},false,false);
test('spawn, death and nitrous are edges, not countdown messages; resumed baselines never replay',()=>{
  const shield=signals({spawn_protection_s:2}),dead=signals({defeated:true,last_damage_kind:'water'});
  assert.deepEqual(vehicleNoticeTransitions(undefined,shield),[]);
  assert.deepEqual(vehicleNoticeTransitions(undefined,dead),[]);
  assert.equal(vehicleNoticeTransitions(undefined,shield,true)[0].text,'SPAWN PROTECTION ACTIVE');
  assert.deepEqual(vehicleNoticeTransitions(shield,signals({spawn_protection_s:1.8})),[]);
  assert.deepEqual(vehicleNoticeTransitions(signals(),dead),[{text:'VEHICLE LOST IN WATER',tone:'debuff',channel:'system'}]);
  assert.deepEqual(vehicleNoticeTransitions(dead,shield),[{text:'VEHICLE READY · SPAWN PROTECTION ACTIVE',tone:'buff',channel:'system'}]);
  assert.equal(vehicleNoticeTransitions(signals(),signals({}, {vehicle_mask:VehicleFlags.BOOST}))[0].tone,'buff');
});
