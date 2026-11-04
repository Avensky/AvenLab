import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {Group,Vector3,Quaternion,Euler} from 'three';

test('turret mounts, cannon and barrier sample the chassis render time',async()=>{
  const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  try {
    const {PhysicsInterpolationBuffer}=await vite.ssrLoadModule('/src/hooks/usePhysicsInterpolator.ts');
    const {placeRoofTurret}=await vite.ssrLoadModule('/src/combat/turretPresentation.ts');
    const deg=n=>n*Math.PI/180;
    const rotation=new Quaternion().setFromEuler(new Euler(.17,.27,-.2)).toArray();
    const sample=(x,yaw,pitch)=>({id:'v',room_id:1,vehicle_id:'cx30',position:[x,0,0],rotation,
      combat:{enabled:true,role:'assault',x:0,y:.75,z:0,yaw,pitch,shot:5},
      guard:{panel_yaw:yaw}});
    const a=sample(0,deg(179),.1),b=sample(2,deg(-179),.3);
    const buf=new PhysicsInterpolationBuffer();
    buf.setSnapshot('v',a,{tick:1,simulation_time_s:1,received_at_ms:1000});
    buf.setSnapshot('v',b,{tick:2,simulation_time_s:1.05,received_at_ms:1050});
    const pose=buf.getInterpolated('v',50,1075);
    assert(Math.abs(pose.position[0]-1)<1e-10);
    assert(Math.abs(Math.abs(pose.combat.yaw)-Math.PI)<1e-10);
    assert(Math.abs(pose.combat.pitch-.2)<1e-10);
    assert.equal(pose.combat.shot,5);
    assert(Math.abs(pose.guard.panel_yaw-pose.combat.yaw)<1e-10);
    const mount=new Group(),pivot=new Group(),gun=new Group();mount.add(pivot);pivot.add(gun);
    placeRoofTurret(mount,pivot,gun,pose,pose.combat,new Vector3(),new Quaternion());
    const expected=new Vector3(0,.75,0).applyQuaternion(new Quaternion(...rotation)).add(new Vector3(1,0,0));
    assert(pivot.getWorldPosition(new Vector3()).distanceTo(expected)<1e-8);
    const aim=new Vector3(0,0,-1).applyQuaternion(gun.getWorldQuaternion(new Quaternion()));
    assert(aim.distanceTo(new Vector3(0,Math.sin(.2),Math.cos(.2)))<1e-8);
    // A replacement world restarts tick numbering. Its first mount is exact.
    const next={...a,room_id:2,position:[100,5,0]};
    buf.setSnapshot('v',next,{tick:1,simulation_time_s:0,received_at_ms:1100});
    assert.equal(buf.getInterpolated('v',50,1110),next);
  } finally {await vite.close();}
});
test('locked turret traverses the seam and mode transitions preserve world aim',async()=>{
 const {blendCombatAim}=await import('../src/combat/turretPresentation.ts');
 const a={enabled:true,role:'tank',x:0,y:1,z:1,yaw:0,pitch:0,hull_locked:true,lock_yaw:3,lock_pitch:.1};
 const b={...a,yaw:.4,lock_yaw:-3,lock_pitch:.3};
 const locked=blendCombatAim(a,b,.5);
 assert(locked.hull_locked);assert(Math.abs(locked.lock_yaw-Math.PI)<1e-8);assert(Math.abs(locked.lock_pitch-.2)<1e-8);
 const unlocked=blendCombatAim(a,{...b,hull_locked:false},.5);
 assert.equal(unlocked.hull_locked,false);assert.equal(unlocked.lock_yaw,undefined);assert.equal(unlocked.yaw,.2);
 assert.equal(blendCombatAim(undefined,b,.5),b);
});
