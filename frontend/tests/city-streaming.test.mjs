import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Frustum, Group, InstancedMesh, Matrix4, Mesh, MeshPhysicalMaterial, PerspectiveCamera, Quaternion, SkinnedMesh, Texture, Vector3 } from 'three';
import { cityAssetVisible, detailedCityChunks, cityTextureAsset } from '../src/world/cityLod.ts';
import { createCityInstances } from '../src/world/cityInstances.ts';
import { beginCityPreparation, cityStreamingStats, CityWorkQueue } from '../src/world/cityWorkQueue.ts';

const visual = { id:'blocks', asset:'city.glb', position:[0,0,0], rotation:[0,0,0,1], scale:[1,1,1] };
const chunks = Array.from({length:9},(_,i)=>({x:i%3,z:Math.floor(i/3),origin:[i%3*200,0,Math.floor(i/3)*400]}));
const map = {cell:[200,400],chunks,collider_chunks:chunks.map(c=>({...c,boxes:[]}))};
const placement=(x,y,z)=>({chunk:{x,z,origin:[x,y,z]},visual});
const build=(source,capacity=3,fast=true)=>{const asset=createCityInstances(source,capacity,fast);assert.ok(asset);asset.objects.forEach(asset.prepareMesh);return asset;};
const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-5,`${v} vs ${b[i]} at ${i}`));

test('city detail is bounded, uses backend rectangular cells, has hysteresis, and retains an Original option',()=>{
 assert.deepEqual(detailedCityChunks(map,0,0,'fast'),['0,0','1,0']);
 assert.ok(detailedCityChunks(map,200,400,'balanced').length<=4);
 assert.equal(detailedCityChunks(map,0,0,'original').length,9);
 assert.equal(detailedCityChunks({...map,collider_chunks:undefined},0,0,'fast').length,9,'no proxy metadata must not hide buildings');
 assert.ok(detailedCityChunks(map,100000,-100000,'fast').length>=1,'retain a nearest model outside the grid');
 const old=detailedCityChunks(map,100,0,'fast',['1,0','0,0']);
 assert.deepEqual(detailedCityChunks(map,99.5,0,'fast',old),old,'avoid repeated level swaps at a cell boundary');
});

test('all environment, chunk and individual-asset visibility overrides retain their meaning',()=>{
 const chunk={x:-2,z:1,origin:[-400,0,400]},key='-2,1';
 assert.equal(cityAssetVisible(chunk,visual,'glb',{},{}),true);
 assert.equal(cityAssetVisible(chunk,visual,'collider',{},{}),false);
 assert.equal(cityAssetVisible(chunk,visual,'glb',{[key]:'hidden'},{}),false);
 assert.equal(cityAssetVisible(chunk,visual,'glb',{}, {[key+'/blocks']:false}),false);
 assert.equal(cityAssetVisible(chunk,visual,'hidden',{}, {[key+'/blocks']:true}),true);
});

test('instance transforms apply backend chunk, visual and every authored node transform exactly once',()=>{
 const source=new Group();source.position.set(4,2,-3);source.rotation.x=.3;source.scale.setScalar(2);
 const nested=new Group();nested.position.set(8,0,12);nested.rotation.y=.2;source.add(nested);
 const geometry=new BoxGeometry(2,4,6),material=new MeshPhysicalMaterial({transmission:1});material.name='bricks';
 const texture=new Texture();material.map=texture;
 const mesh=new Mesh(geometry,material);mesh.position.set(1,3,2);nested.add(mesh);source.updateWorldMatrix(true,true);
 const authored=mesh.matrixWorld.clone(),sourceScale=source.scale.toArray();
 const asset=build(source,2);
 const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.6).toArray();
 const p={chunk:{x:1,z:-1,origin:[200,0,-400]},visual:{...visual,position:[3,1,4],rotation:q,scale:[2,1,3]}};
 const list=[p,{...p,chunk:{x:2,z:0,origin:[400,0,0]}}];
 asset.update(list,new Frustum(),true);
 const expected=new Matrix4().makeTranslation(...p.chunk.origin).multiply(new Matrix4().compose(new Vector3(...p.visual.position),new Quaternion(...q),new Vector3(...p.visual.scale))).multiply(authored);
 const actual=new Matrix4();asset.batches[0].mesh.getMatrixAt(0,actual);near(actual.elements,[...new Float32Array(expected.elements)]);
 assert.equal(asset.batches.length,1);assert.equal(asset.batches[0].mesh.count,2);
 assert.equal(asset.batches[0].mesh.geometry,geometry);assert.equal(asset.batches[0].mesh.material.map,texture);
 assert.equal(asset.batches[0].mesh.material.transmission,0);assert.equal(material.transmission,1);
 assert.deepEqual(source.scale.toArray(),sourceScale);
 let originalDisposals=0,ownedDisposals=0;
 for(const object of [geometry,texture,material])object.addEventListener('dispose',()=>originalDisposals++);
 asset.batches[0].mesh.material.addEventListener('dispose',()=>ownedDisposals++);
 asset.dispose();assert.equal(originalDisposals,0);assert.equal(ownedDisposals,1);
 geometry.dispose();texture.dispose();material.dispose();
});

test('per-instance culling packs visible tiles and stable camera membership avoids GPU matrix uploads',()=>{
 const source=new Group(),geometry=new BoxGeometry(2,2,2),material=new MeshPhysicalMaterial();source.add(new Mesh(geometry,material));
 const asset=build(source),camera=new PerspectiveCamera(60,1,.1,100);camera.lookAt(0,0,-1);camera.updateMatrixWorld(true);
 const frustum=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 const list=[placement(0,0,-5),placement(1000,0,-5),placement(0,0,-15)];
 assert.equal(asset.update(list,frustum,false),2);assert.equal(asset.batches[0].mesh.count,2);
 const packed=new Matrix4();asset.batches[0].mesh.getMatrixAt(1,packed);assert.equal(packed.elements[14],-15);
 const version=asset.batches[0].mesh.instanceMatrix.version;
 asset.update(list,frustum,false);assert.equal(asset.batches[0].mesh.instanceMatrix.version,version);
 assert.equal(asset.update(list,frustum,true),3,'keep offscreen shadow casters when shadows are requested');
 assert.throws(()=>asset.update([...list,placement(0,0,-20)],frustum,false),/capacity/);
 asset.dispose();geometry.dispose();material.dispose();
});

test('Fast city glass stays see-through without a refraction pass; Balanced retains native glass',()=>{
 const source=new Group(),geometry=new BoxGeometry(),glass=new MeshPhysicalMaterial({transmission:.9,alphaTest:.5});glass.name='Glass';source.add(new Mesh(geometry,glass));
 const fast=build(source,1,true),balanced=build(source,1,false),m=fast.batches[0].mesh.material;
 assert.equal(m.transmission,0);assert.equal(m.transparent,true);assert.equal(m.alphaTest,0);assert.equal(m.depthWrite,false);
 assert.ok(m.opacity>0&&m.opacity<1);assert.equal(balanced.batches[0].mesh.material.transmission,.9);
 assert.equal(glass.transmission,.9);assert.equal(glass.alphaTest,.5);
 fast.dispose();balanced.dispose();geometry.dispose();glass.dispose();
});

test('animated, mirrored or already-instanced imports fall back rather than losing parts',()=>{
 const geometry=new BoxGeometry(),material=new MeshPhysicalMaterial();
 const mirrored=new Mesh(geometry,material);mirrored.scale.x=-1;
 for(const object of [new SkinnedMesh(geometry,material),new InstancedMesh(geometry,material,2),mirrored]){
  const source=new Group();source.add(object);assert.equal(createCityInstances(source,2,true),null);assert.equal(source.children[0],object);
  if(object.isInstancedMesh)object.dispose();
 }
 geometry.dispose();material.dispose();
});

test('one shared city queue yields at its time budget and preserves job order',async()=>{
 const frames=[],done=[];let now=0;
 const queue=new CityWorkQueue(callback=>frames.push(callback),()=>now,3,12);
 const promises=Array.from({length:5},(_,i)=>queue.enqueue(()=>{done.push(i);now+=2;return i;}));
 assert.equal(frames.length,1);frames.shift()();assert.deepEqual(done,[0,1]);assert.equal(frames.length,1);
 while(frames.length)frames.shift()();assert.deepEqual(await Promise.all(promises),[0,1,2,3,4]);
});

test('queue cancellation releases pending jobs and one failed job does not block other assets',async()=>{
 const frames=[],controller=new AbortController(),queue=new CityWorkQueue(cb=>frames.push(cb),()=>0);
 let ran=false;const cancelled=queue.enqueue(()=>{ran=true;},controller.signal);controller.abort();await cancelled;
 const failed=queue.enqueue(()=>{throw new Error('bad asset');});const rejection=assert.rejects(failed,/bad asset/);
 const next=queue.enqueue(()=>42);while(frames.length)frames.shift()();await rejection;assert.equal(await next,42);assert.equal(ran,false);
});

test('capture readiness tracks every preparation and completion is idempotent',()=>{
 const a=beginCityPreparation('blocks'),b=beginCityPreparation('roads');
 assert.equal(cityStreamingStats().pending,2);a.phase('uploading');assert.match(cityStreamingStats().phase,/blocks: uploading/);
 a.end();a.end();assert.equal(cityStreamingStats().pending,1);b.end();assert.equal(cityStreamingStats().pending,0);
});

test('texture variants only remap the known city templates and preserve Original/custom maps',()=>{
 const source='/models/chuncks/chunck_0,0_2x2_blocks_centered.glb';
 assert.equal(cityTextureAsset(source,'fast'),source.replace('.glb','_textures512.glb'));
 assert.equal(cityTextureAsset(source,'balanced'),source.replace('.glb','_textures1024.glb'));
 assert.equal(cityTextureAsset(source,'original'),source);
 assert.equal(cityTextureAsset('/models/custom.glb','fast'),'/models/custom.glb');
});
