import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Frustum, Group, Matrix4, Mesh, MeshPhysicalMaterial, PerspectiveCamera } from 'three';
import { cityBlocks, cityBlockLevels, cityBlockName, cityBlockKey } from '../src/world/cityBlocks.ts';
import { createCityInstances } from '../src/world/cityInstances.ts';

const visual={id:'blocks',asset:'/models/chuncks/chunck_0,0_2x2_blocks_centered.glb',position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]};
const chunks=Array.from({length:9},(_,i)=>({x:i%3,z:Math.floor(i/3),origin:[i%3*258,0,Math.floor(i/3)*440]}));
const map={visuals:[visual],chunks,collider_chunks:chunks.map(c=>({...c,boxes:Array.from({length:4},(_,i)=>({id:`block_${i%2}_${Math.floor(i/2)}_building`,kind:'building',center:[c.origin[0]+(i%2)*120,200,c.origin[2]+Math.floor(i/2)*210],half_extents:[45,200,90]}))}))};

test('city block bounds use authoritative horizontal footprints, not tower height or assumed chunk cells',()=>{
 const blocks=cityBlocks(map);assert.equal(blocks.length,36);
 assert.deepEqual(blocks[0],{key:'0,0/Block_0_0',chunk:'0,0',name:'Block_0_0',minX:-45,maxX:45,minZ:-90,maxZ:90});
 assert.equal(cityBlockName('block_1_0_building_10'),'Block_1_0');
 assert.equal(cityBlockName('custom-building'),null);
 assert.deepEqual(cityBlocks({...map,visuals:[{...visual,asset:'/custom.glb'}]}),[]);
 assert.deepEqual(cityBlocks({...map,collider_chunks:[{x:0,z:0,boxes:[{id:'unknown',kind:'building'}]}]}),[]);
});

test('all nearby blocks get native GLBs across a four-chunk junction without a two-chunk slot limit',()=>{
 const blocks=cityBlocks(map),levels=cityBlockLevels(blocks,129,440,'fast');
 const modelChunks=new Set(blocks.filter(b=>levels[b.key]!=='proxy').map(b=>b.chunk));
 assert.ok(modelChunks.size>2,'nearby geometry is not limited by whole-chunk slots');
 for(const b of blocks){const d=Math.hypot(Math.max(b.minX-129,0,129-b.maxX),Math.max(b.minZ-440,0,440-b.maxZ));if(d<=500)assert.notEqual(levels[b.key],'proxy');}
 const edge=cityBlockLevels([{key:'next',minX:400,maxX:600,minZ:-50,maxZ:50}],0,0,'fast');
 assert.equal(edge.next,'reduced','a textured model is already present 400 m before the block');
});

test('full/reduced/proxy bands retain hysteresis and Balanced extends the model range',()=>{
 const blocks=[{key:'b',minX:0,maxX:100,minZ:0,maxZ:100}];
 assert.equal(cityBlockLevels(blocks,-80,50,'fast').b,'full');
 assert.equal(cityBlockLevels(blocks,-90,50,'fast',{b:'full'}).b,'full');
 assert.equal(cityBlockLevels(blocks,-96,50,'fast',{b:'full'}).b,'reduced');
 assert.equal(cityBlockLevels(blocks,-500,50,'fast').b,'reduced');
 assert.equal(cityBlockLevels(blocks,-530,50,'fast',{b:'reduced'}).b,'reduced');
 assert.equal(cityBlockLevels(blocks,-536,50,'fast',{b:'reduced'}).b,'proxy');
 assert.equal(cityBlockLevels(blocks,-700,50,'balanced').b,'reduced');
 assert.equal(cityBlockLevels(blocks,-10000,50,'original').b,'full');
});

test('full and reduced instances share materials/transforms, replace proxies, and retain stable GPU buffers',()=>{
 const source=new Group(),block=new Group(),low=new Group();block.name='Block_0_0';source.add(block);
 const geometry=new BoxGeometry(2,4,2),reducedGeometry=new BoxGeometry(2,4,2),material=new MeshPhysicalMaterial();
 const mesh=new Mesh(geometry,material);mesh.name='facade';mesh.position.x=2;block.add(mesh);
 const reduced=new Mesh(reducedGeometry,new MeshPhysicalMaterial());reduced.name='facade';low.add(reduced);
 const asset=createCityInstances(source,3,true,low);asset.objects.forEach(asset.prepareMesh);
 const camera=new PerspectiveCamera(80,1,.1,100);camera.lookAt(0,0,-1);camera.updateMatrixWorld(true);
 const frustum=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 const entries=['full','reduced','proxy'].map((level,i)=>({chunk:{x:i,z:0,origin:[0,0,-10-i*10]},visual,blocks:{Block_0_0:level}}));
 assert.equal(asset.update(entries,frustum,true),2);
 const batch=asset.batches[0];assert.equal(batch.mesh.count,1);assert.equal(batch.reduced.count,1);
 assert.equal(batch.reduced.material,batch.mesh.material);assert.equal(batch.reduced.geometry,reducedGeometry);assert.equal(batch.mesh.geometry,geometry);
 assert.equal(batch.mesh.castShadow,true);assert.equal(batch.reduced.castShadow,false);
 const matrix=new Matrix4();batch.reduced.getMatrixAt(0,matrix);assert.equal(matrix.elements[12],2);assert.equal(matrix.elements[14],-20);
 const versions=[batch.mesh.instanceMatrix.version,batch.reduced.instanceMatrix.version];asset.update(entries,frustum,true);
 assert.deepEqual([batch.mesh.instanceMatrix.version,batch.reduced.instanceMatrix.version],versions);
 let disposals=0;geometry.addEventListener('dispose',()=>disposals++);reducedGeometry.addEventListener('dispose',()=>disposals++);
 asset.dispose();assert.equal(disposals,0,'cached GLB geometry is shared, not owned by the instance batches');
 geometry.dispose();reducedGeometry.dispose();material.dispose();reduced.material.dispose();
});

test('missing reduced meshes keep full geometry instead of dropping visible building parts',()=>{
 const source=new Group(),block=new Group();block.name='Block_1_1';source.add(block);
 const geometry=new BoxGeometry(),material=new MeshPhysicalMaterial();block.add(new Mesh(geometry,material));
 const asset=createCityInstances(source,1,true,new Group());asset.objects.forEach(asset.prepareMesh);
 assert.equal(asset.update([{chunk:{x:0,z:0,origin:[0,0,0]},visual,blocks:{Block_1_1:'reduced'}}],new Frustum(),true),1);
 assert.equal(cityBlockKey(-1,2,'Block_1_1'),'-1,2/Block_1_1');asset.dispose();geometry.dispose();material.dispose();
});
