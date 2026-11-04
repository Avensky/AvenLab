import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {Group,Quaternion,Vector3} from 'three';

test('carried flag stays attached to the rendered chassis through movement, yaw and cosmetic bob',async t=>{
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}});
 try{
  const {updateCarriedFlagPose:update,CARRIED_FLAG_ROTATION:turn,CARRIED_FLAG_SCALE:scale,FLAG_BOB_AMPLITUDE:amplitude,FLAG_BOB_PERIOD_S:period}=await vite.ssrLoadModule('/src/game/stats/carriedFlagVisual.ts');
  const {PhysicsInterpolationBuffer}=await vite.ssrLoadModule('/src/hooks/usePhysicsInterpolator.ts');
  const root=new Group(),bob=new Group();root.add(bob);bob.rotation.y=turn;bob.scale.setScalar(scale);
  const pose=(x,yaw)=>({id:'carrier',kind:'vehicle',vehicle_id:'brz',position:[x,1,10],rotation:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw).toArray()});
  await t.test('samples exactly the shared interpolated movement, including a late packet and a large relocation',()=>{
   const buffer=new PhysicsInterpolationBuffer(()=>1000),first=pose(0,0),second=pose(4,Math.PI/2);
   buffer.setSnapshot('carrier',first,{tick:1,received_at_ms:1000});buffer.setSnapshot('carrier',second,{tick:2,received_at_ms:1016.6666666667});
   const chosen=buffer.getInterpolated('carrier',50,1058.3333333333);assert(chosen.position[0]>0&&chosen.position[0]<4);
   update(root,bob,chosen,0);assert.deepEqual(root.position.toArray(),chosen.position);assert.deepEqual(root.quaternion.toArray(),chosen.rotation);
   // An out-of-order arrival cannot put the attachment ahead of its vehicle.
   buffer.setSnapshot('carrier',pose(100,Math.PI),{tick:1,received_at_ms:1020});
   const repeated=buffer.getInterpolated('carrier',50,1058.3333333333);update(root,bob,repeated,.01);assert.deepEqual(root.position.toArray(),chosen.position);
   const relocated=pose(450,-Math.PI/2);update(root,bob,relocated,1);assert.deepEqual(root.position.toArray(),relocated.position,'no second smoothing filter trails a reset/respawn');
  });
  await t.test('cloth remains parallel to chassis length while vehicle turns, with a modest size increase',()=>{
   assert(scale>1&&scale<1.5);
   for(const yaw of [0,.4,Math.PI/2,-Math.PI]){
    const chassis=pose(2,yaw);update(root,bob,chassis,0);root.updateMatrixWorld(true);
    const clothWidth=new Vector3(1,0,0).transformDirection(bob.matrixWorld),chassisLength=new Vector3(0,0,1).applyQuaternion(root.quaternion);
    assert(Math.abs(Math.abs(clothWidth.dot(chassisLength))-1)<1e-9,'fabric spans vehicle length rather than width');
   }
  });
  await t.test('bob is bounded, periodic and continuous across render frames rather than network ticks',()=>{
   const chassis=pose(2,0);let previous;
   for(let frame=0;frame<=Math.ceil(period*60);frame++){
    update(root,bob,chassis,frame/60);assert(Math.abs(bob.position.y-1.1)<=amplitude+1e-9);
    if(previous!==undefined)assert(Math.abs(bob.position.y-previous)<.01,'one-frame motion stays smooth');previous=bob.position.y;
    assert.deepEqual(root.position.toArray(),chassis.position,'cosmetic bounce never moves the chassis anchor');
   }
   update(root,bob,chassis,0);const start=bob.position.y;update(root,bob,chassis,period);assert(Math.abs(bob.position.y-start)<1e-9);
   update(root,bob,chassis,NaN);assert(Number.isFinite(bob.position.y));
  });
 }finally{await vite.close();}
});
