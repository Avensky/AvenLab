import test from 'node:test';
import assert from 'node:assert/strict';
import {SkidTrail} from '../src/vehicles/effects/skidTrail.ts';
const contact=(x=0,intensity=.8)=>[x,0,0,0,1,0,intensity];
test('a moving grounded skid draws only between valid consecutive contact points',()=>{
 const trail=new SkidTrail();assert.equal(trail.sample(contact(),true,0),null);
 const mark=trail.sample(contact(.3),true,.05);assert.deepEqual(mark.from,[0,0,0]);assert.deepEqual(mark.to,[.3,0,0]);assert.equal(mark.intensity,.8);
 assert.equal(trail.sample(contact(.31),true,.06),null);
});
test('airborne, lost grip, invalid normals, gaps and teleports break trails',()=>{
 for(const interrupt of [t=>t.sample(null,false,.1),t=>t.sample(contact(.3,0),true,.1),t=>t.sample([0,0,0,0,-1,0,.9],true,.1),t=>t.sample([NaN,0,0,0,1,0,.9],true,.1),t=>t.sample(contact(40),true,.1)]){
  const trail=new SkidTrail();trail.sample(contact(),true,0);interrupt(trail);
  assert.equal(trail.sample(contact(.6),true,.2),null);
 }
});
test('sloped road marks retain the contact normal and stationary burnouts cannot fill the pool each frame',()=>{
 const trail=new SkidTrail(),n=[0,.9805807,-.1961161];
 const a=[0,0,0,...n,.9],b=[0,.06,.3,...n,.9];trail.sample(a,true,0);
 const mark=trail.sample(b,true,.05);assert(mark);assert(Math.abs(mark.normal[2]+.1961161)<.00001);
 for(let i=1;i<5;i++)assert.equal(trail.sample(b,true,.05+i*.03),null);
});

test('a stale interval starts a new trail instead of connecting across the gap',()=>{
 const trail=new SkidTrail();trail.sample(contact(),true,0);assert.equal(trail.sample(contact(.3),true,1),null);
 assert.deepEqual(trail.sample(contact(.6),true,1.1).from,[.3,0,0]);
});
