import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {PlaneGeometry} from 'three';

test('flag cloth hinges around its pole and stays readable from edge-on views',async t=>{
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]}});
 try{
  const {flagClothTargetYaw:target,approachFlagClothYaw:advance,updateFlagCloth:update,FLAG_FACE_TARGET:face}=await vite.ssrLoadModule('/src/game/stats/flagClothMotion.ts');
  await t.test('camera directions select the nearest readable side while broadside cloth keeps its rest angle',()=>{
   for(const current of [0,.4,Math.PI/2,-Math.PI])for(let i=0;i<64;i++){
    const bearing=i*Math.PI/32,x=Math.sin(bearing)*10,z=Math.cos(bearing)*10,yaw=target(current,x,z);
    assert(Math.abs(Math.cos(bearing-yaw))>=face-1e-10,'fabric keeps visible face area');
    const travelled=Math.atan2(Math.sin(yaw-current),Math.cos(yaw-current));assert(Math.abs(travelled)<Math.PI/2,'no half-turn flip');
   }
   assert.equal(target(0,0,10),0);assert.equal(target(0,0,-10),0,'DoubleSide avoids unnecessary rear-facing flip');
  });
  await t.test('motion is frame-rate independent, gradual through changing camera bearings, and bounded after a long frame',()=>{
   const end=target(0,10,0),full=advance(0,end,.02),half=advance(advance(0,end,.01),end,.01);
   assert(Math.abs(full-half)<1e-10);assert(full>0&&full<end);
   assert.equal(advance(0,end,100),advance(0,end,.05));assert.equal(advance(.3,Infinity,.01),.3);
   let yaw=end;
   for(let i=0;i<600;i++){
    const bearing=Math.PI/2+i*.012,next=advance(yaw,target(yaw,Math.sin(bearing)*10,Math.cos(bearing)*10),1/60);
    assert(Math.abs(Math.atan2(Math.sin(next-yaw),Math.cos(next-yaw)))<.02);yaw=next;
   }
   assert.equal(target(.4,NaN,0),.4);assert.equal(target(.4,0,0),.4);
  });
  await t.test('curved waving sheet fixes its pole edge and reuses finite position and normal buffers',()=>{
   const geometry=new PlaneGeometry(1.2,.7,10,3),position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');
   const vertices=position.array,normals=normal.array;update(geometry,0);const start=vertices.slice();
   let curved=false,moved=false;
   for(let frame=0;frame<120;frame++){
    update(geometry,frame/60);assert.equal(position.array,vertices);assert.equal(normal.array,normals);
    for(let i=0;i<position.count;i++){
     const u=uv.getX(i),v=uv.getY(i);assert(Number.isFinite(position.getZ(i)));assert(Math.abs(position.getZ(i))<.19);
     assert(Math.abs(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))-1)<1e-5);
     if(u===0){assert(Math.abs(position.getX(i)+.6)<1e-6);assert(Math.abs(position.getY(i)-(v-.5)*.7)<1e-6);assert.equal(position.getZ(i),0);}
     if(Math.abs(position.getZ(i))>.05)curved=true;if(Math.abs(position.getZ(i)-start[i*3+2])>.01)moved=true;
    }
   }
   assert(curved&&moved);update(geometry,NaN);assert([...vertices].every(Number.isFinite));geometry.dispose();
  });
 }finally{await vite.close();}
});
