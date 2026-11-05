import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';
import {rescueFlight,RESCUE_DURATION} from '../src/game/results/rescueFlight.ts';
import {prepareLampLenses} from '../src/vehicles/tools/lampLenses.ts';
import {Group,Mesh,BoxGeometry,MeshStandardMaterial} from 'three';
import {harborCanal} from '../src/worldBuilder/generation/harborCanal.ts';
import {parseLayout,updatePiece} from '../src/worldBuilder/document/layoutDocument.ts';

test('new cars include four independent rigged hubs, portraits and three usable detail levels',()=>{
  function glb(path){
    const b=fs.readFileSync(new URL('../public/'+path,import.meta.url));assert.equal(b.readUInt32LE(8),b.length);
    return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
  }
  for(const id of ['charger70','skyline34','enforcer','interceptor','timecar']){
    const g=glb('models/vehicles/'+id+'.glb');
    const node=name=>g.nodes.find(n=>n.name===name);
    assert(node('VEHICLE_ROOT')&&node('CHASSIS_ANCHOR'));
    for(const c of ['FL','FR','RL','RR']){
      const h=node('WHEEL_'+c);assert(h.children.some(i=>g.nodes[i].name==='SPIN_'+c));
      assert.equal(Math.sign(h.translation[0]),c.endsWith('L')?-1:1);
      assert.equal(Math.sign(h.translation[2]),c.startsWith('F')?1:-1);
    }
    for(const lod of ['near','medium','far']) assert(glb('models/vehicles/lod/'+id+'-'+lod+'.glb').meshes.length);
    assert(fs.statSync(new URL('../public/images/heroes/'+id+'.webp',import.meta.url)).size>1500);
  }
  assert(glb('models/world/rescue-helicopter.glb').nodes.some(n=>n.name==='MAIN_ROTOR'));
});
test('the folding bridge meets the helicopter smoothly and the vehicle leaves with the sling',()=>{
 const pickup=rescueFlight(3.8),after=rescueFlight(3.80001),finish=rescueFlight(RESCUE_DURATION);
 assert(Math.abs(after.y-pickup.y)<.001 && Math.abs(after.x-pickup.x)<.001);
 assert.equal(pickup.x,pickup.helicopterX);assert(Math.abs(pickup.helicopterY-pickup.y-3)<1e-6);
 assert(finish.x>pickup.x && finish.y>pickup.y && finish.sling===1);assert.deepEqual(finish,rescueFlight(30));
});
test('harbor bays use the measured two-wall model, and service and enclosure are independently selectable',()=>{
 const layout=harborCanal('fleet',12).authored_layout;
 for(const bay of layout.objects.filter(o=>['fuel-station','repair-shop','service-center'].includes(o.piece))){
  assert.equal(bay.model.asset,'selection_garage');assert.equal(bay.parts.length,0);
  const repair=updatePiece(layout,bay.id,{piece:'repair-shop'});
  assert.equal(repair.objects.find(o=>o.id===bay.id).piece,'repair-shop');
  const enclosed=updatePiece(repair,bay.id,{model:undefined,parts:[{shape:'box',position:[0,.5,-.48],size:[1,1,.04]}]});
  assert(parseLayout(enclosed));
 }
 assert(layout.objects.filter(o=>o.piece==='coastal-ramp').every(o=>o.parts[0].shape==='deck'));
});
test('lamp covers are translucent per instance and the body retains the original opaque material',()=>{
 const root=new Group(),frame=new MeshStandardMaterial(),lens=new MeshStandardMaterial();
 lens.name='lamp_cover';const mesh=new Mesh(new BoxGeometry(),[frame,lens]);root.add(mesh);
 const release=prepareLampLenses(root);assert.equal(mesh.material[0],frame);assert.equal(mesh.material[1].transparent,true);
 assert.equal(mesh.material[1].depthWrite,false);assert.equal(lens.transparent,false);release();assert.equal(mesh.material[1],lens);
});
test('night enables tails and plate bulbs, braking fills both tails and the center stop',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
 try{
  const {lampSignal,SERVICE_BRAKE_LAMP}=await server.ssrLoadModule('/src/vehicles/ExteriorMarkers.tsx');
  assert.equal(SERVICE_BRAKE_LAMP,1<<12);
  assert.equal(lampSignal('tail',true,false),'tail');assert.equal(lampSignal('plate',true,false),'plate');assert.equal(lampSignal('stop',true,false),null);
  for(const night of [false,true]){assert.equal(lampSignal('tail',night,true),'stop');assert.equal(lampSignal('stop',night,true),'stop');}
  assert.equal(lampSignal('plate',false,true),null);
 }finally{await server.close();}
});
