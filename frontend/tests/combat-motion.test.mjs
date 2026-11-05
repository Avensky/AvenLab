import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {InstancedMesh, Matrix4, BoxGeometry, MeshBasicMaterial} from 'three';

test('slow world delivery keeps moving between receipts, raw poses step and a confirmed blink snaps',async()=>{
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},logLevel:'error'});
 try{
  const {PhysicsInterpolationBuffer}=await vite.ssrLoadModule('/src/hooks/usePhysicsInterpolator.ts');
  const {ResourceFlags}=await vite.ssrLoadModule('/src/store/telemetry/resourceMasks.ts');
  const buffer=new PhysicsInterpolationBuffer(), pose=(z,resource_mask=0)=>({id:'medic',room_id:1,vehicle_id:'fortuner',position:[0,0,z],rotation:[0,0,0,1],resource_mask});
  let tick=0,smooth=0,raw=0,previousZ=-1,previousRaw=-1;
  for(let now=0;now<=10000;now+=10){
    if(now%40===0){tick+=2;buffer.setSnapshot('medic',pose(tick*.1),{tick,simulation_time_s:tick/60,received_at_ms:now});}
    const displayed=buffer.getInterpolated('medic',50,now).position[2];
    if(now>500){if(displayed!==previousZ)smooth++;if(previousRaw!==tick)raw++;assert(displayed>=previousZ);}
    previousZ=displayed;previousRaw=tick;
  }
  assert(smooth>925);assert(raw<245);
  const jumped=pose(tick*.1+12,ResourceFlags.BLINK_STRESS);
  buffer.setSnapshot('medic',jumped,{tick:tick+2,simulation_time_s:(tick+2)/60,received_at_ms:10040});
  assert.equal(buffer.getInterpolated('medic',50,10040).position[2],jumped.position[2]);

  const {writeInstanceMatrix}=await vite.ssrLoadModule('/src/vehicles/writeInstanceMatrix.ts');
  const mesh=new InstancedMesh(new BoxGeometry(),new MeshBasicMaterial(),1),matrix=new Matrix4().makeTranslation(1.234,0,2);
  assert(writeInstanceMatrix(mesh,0,matrix));
  for(let i=0;i<120;i++)assert(!writeInstanceMatrix(mesh,0,matrix));
  matrix.elements[12]+=.1;assert(writeInstanceMatrix(mesh,0,matrix));
  mesh.geometry.dispose();mesh.material.dispose();
 }finally{await vite.close();}
});
