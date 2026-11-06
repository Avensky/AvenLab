import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Box3,Vector3,Quaternion,Raycaster} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {extractWheelAssembly,applyBackendWheelPose} from '../src/vehicles/tools/vehicleVisualRig.ts';

test('CX-30 GLB uses meter-scale Y-up chassis and four independently posed hubs',async t=>{
 const bytes=await readFile(new URL('../public/models/vehicles/land/suvs/cx30/model.glb',import.meta.url));
 if(bytes.toString('utf8',0,7)==='version')return t.skip('Fetch the CX-30 Git LFS model.');
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const size=new Box3().setFromObject(scene,true).getSize(new Vector3());
 assert(Math.abs(size.x-2.132)<.02 && Math.abs(size.y-1.54)<.02 && Math.abs(size.z-4.329)<.02);
 for(const name of ['VEHICLE_ROOT','CHASSIS_ANCHOR','CONTACT_ANCHOR','BODYWORK','GLASS','LAMPS','INTERIOR','HEADLIGHT_L','HEADLIGHT_R','BRAKELIGHT_L','BRAKELIGHT_R','TURN_FL','TURN_RR','CAMERA_DRIVER'])assert(scene.getObjectByName(name),name);
 for(const corner of ['fl','fr','rl','rr']){
  const tag=corner.toUpperCase();
  const assembly=extractWheelAssembly(scene,{corner,rootNames:['WHEEL_'+tag],isFixedPart:o=>o.name==='CALIPER_'+tag});
  assert(assembly,tag);
  assert(Math.abs(assembly.carrier.position.x-(corner.endsWith('l')?-.812:.812))<.002);
  assert(Math.abs(assembly.carrier.position.z-(corner.startsWith('f')?1.245:-1.374))<.002);
  assert(Math.abs(assembly.carrier.position.y+.5044)<.002);
  const fixed=assembly.carrier.getObjectByName('CALIPER_'+tag),spinning=assembly.spinner.getObjectByName('SPIN_'+tag);
  assert(fixed&&spinning);assert.equal(assembly.spinner.getObjectByName('CALIPER_'+tag),undefined);
  applyBackendWheelPose(assembly,[4,2,-1],[0,0,0,1],0,Math.PI/2);
  assert.deepEqual(assembly.carrier.position.toArray(),[4,2,-1]);
  assert(fixed.getWorldQuaternion(new Quaternion()).angleTo(new Quaternion())<.0001);
  assert(Math.abs(spinning.getWorldQuaternion(new Quaternion()).angleTo(new Quaternion())-Math.PI/2)<.0001);
 }
});

test('only the CX-30 sunroof pane uses its glossy tinted glass material', async t=>{
 const bytes=await readFile(new URL('../public/models/vehicles/land/suvs/cx30/model.glb',import.meta.url));
 if(bytes.toString('utf8',0,7)==='version')return t.skip('Fetch the CX-30 Git LFS model.');
 const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
 const index=gltf.materials.findIndex(m=>m.name==='sunroof_glass');
 assert(index>=0);
 const glass=gltf.materials[index],pbr=glass.pbrMetallicRoughness;
 assert.equal(glass.alphaMode,'BLEND');
 assert(pbr.baseColorFactor[3]>0 && pbr.baseColorFactor[3]<1 && pbr.roughnessFactor<.15);
 const owners=gltf.meshes.filter(mesh=>mesh.primitives.some(primitive=>primitive.material===index));
 assert.equal(owners.length,1);
 assert(gltf.nodes.some(n=>n.name==='GLASS_MESH' && n.mesh===gltf.meshes.indexOf(owners[0])));
 // A tinted material alone cannot reveal the cabin if the opaque shade still
 // spans the opening. Probe both sides and the middle of the actual export.
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 scene.updateMatrixWorld(true);
 for(const x of [-.25,0,.25]){
   const ray=new Raycaster(new Vector3(x,1,-.27),new Vector3(0,-1,0),0,.5);
   const hits=ray.intersectObject(scene,true);
   assert(hits.length>0);
   assert(hits.every(h=>h.object.material.name==='sunroof_glass'));
 }
});
