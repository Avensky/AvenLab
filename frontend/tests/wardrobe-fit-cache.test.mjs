import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BufferGeometry, Float32BufferAttribute, InterleavedBuffer, InterleavedBufferAttribute } from 'three';
import { createServer } from 'vite';
import { loadWardrobeGeometry } from '../scripts/load-wardrobe-geometry.mjs';

const server=()=>createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',
  optimizeDeps:{noDiscovery:true,include:[]}});
const raw=a=>a.isInterleavedBufferAttribute?a.data.array:a.array;
function geometryDigest(root) {
  const hash=createHash('sha256');
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const geometry=mesh.geometry;
    hash.update(JSON.stringify([mesh.name,geometry.drawRange,geometry.groups]));
    for(const [name,a] of [['index',geometry.index],...Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b))]) {
      if(!a)continue;const array=raw(a);
      hash.update(JSON.stringify([name,a.constructor.name,array.constructor.name,a.itemSize,a.normalized,
        a.isInterleavedBufferAttribute?[a.data.stride,a.offset]:null]));
      hash.update(Buffer.from(array.buffer,array.byteOffset,array.byteLength));
    }
  });
  return hash.digest('hex');
}

test('fit snapshots verify in-place edits, preserve current UV/skin data, and never share model-owned arrays',async()=>{
  const vite=await server();
  try {
    const {WardrobeFitCache}=await vite.ssrLoadModule('/src/game/characters/wardrobeFitCache.ts');
    const cache=new WardrobeFitCache(),scope={};
    const source=new BufferGeometry().setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3))
      .setAttribute('normal',new Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3))
      .setAttribute('uv',new Float32BufferAttribute([0,0,1,0,0,1],2)).setIndex([0,1,2]);
    source.setAttribute('skinWeight',new Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
    const support=source.clone();let computations=0;
    const run=(target=source,variant='a')=>cache.fit(scope,variant,[target],[support],()=>{
      computations++;const geometry=target.clone();geometry.attributes.position.setZ(0,support.attributes.position.getZ(0)+.25);
      geometry.computeBoundingBox();geometry.computeBoundingSphere();return [geometry];
    })[0];
    const first=run(),second=run();assert.equal(computations,1);assert.notEqual(first,second);
    assert.notEqual(first.attributes.position.array,second.attributes.position.array);
    assert.deepEqual(first.attributes.position.array,second.attributes.position.array);
    assert.deepEqual(first.boundingBox,second.boundingBox);assert.deepEqual(first.boundingSphere,second.boundingSphere);
    first.attributes.position.setZ(0,10);first.dispose();
    const recolored=source.clone();recolored.attributes.uv.setX(0,.75);recolored.attributes.skinWeight.setX(0,.5);
    const third=run(recolored);assert.equal(computations,1,'unrelated attributes do not refit the geometry');
    assert.equal(third.attributes.position.getZ(0),.25);assert.equal(third.attributes.uv.getX(0),.75);
    assert.equal(third.attributes.skinWeight.getX(0),.5,'a cached fit cannot copy another source skin weight');
    support.attributes.position.setZ(0,.2);const movedBody=run();assert.equal(computations,2,'raw mutations invalidate without needsUpdate');
    assert(Math.abs(movedBody.attributes.position.getZ(0)-.45)<1e-6);
    source.attributes.normal.setX(0,.2);run().dispose();assert.equal(computations,3,'changed authored normals invalidate');
    source.index.setX(0,2);run().dispose();assert.equal(computations,4,'topology invalidates');
    source.setDrawRange(0,0);run().dispose();assert.equal(computations,5,'active face ranges invalidate');
    run(source,'b').dispose();assert.equal(computations,6,'fit variants remain separate');
    for(const geometry of [source,support,second,recolored,third,movedBody])geometry.dispose();
  }finally{await vite.close();}
});

test('fit cache bounds retained buffers and entries and keeps interleaved fields exact',async()=>{
  const vite=await server();
  try {
    const {WardrobeFitCache}=await vite.ssrLoadModule('/src/game/characters/wardrobeFitCache.ts');
    const cache=new WardrobeFitCache(4096,2),scope={};let computations=0;
    const data=new InterleavedBuffer(new Float32Array([0,0,0,0,0,1,.2,.3,1,0,0,0,0,1,.8,.3,0,1,0,0,0,1,.2,.9]),8);
    const source=new BufferGeometry().setAttribute('position',new InterleavedBufferAttribute(data,3,0))
      .setAttribute('normal',new InterleavedBufferAttribute(data,3,3)).setAttribute('uv',new InterleavedBufferAttribute(data,2,6)).setIndex([0,1,2]);
    const run=variant=>cache.fit(scope,variant,[source],[],()=>{computations++;const result=source.clone();result.attributes.position.setZ(0,.25);return [result];})[0];
    const first=run('a'),second=run('a');assert.equal(computations,1);
    assert.deepEqual(raw(first.attributes.position),raw(second.attributes.position));
    assert.equal(second.attributes.uv.getX(0),source.attributes.uv.getX(0));
    for(const key of ['b','a','c','b'])run(key).dispose();
    assert.equal(computations,4,'least-recently-used entries are evicted');assert.equal(cache.stats.entries,2);
    assert(cache.stats.bytes<=4096);cache.clear();assert.equal(cache.stats.entries,0);assert.equal(cache.stats.bytes,0);
    const tiny=new WardrobeFitCache(1,2);tiny.fit(scope,'',[source],[],()=>[source.clone()])[0].dispose();
    assert.equal(tiny.stats.entries,0,'oversize entries do not bypass the byte cap');
    first.dispose();second.dispose();source.dispose();
  }finally{await vite.close();}
});

test('selected vertex warps skip all position and normal samples for unselected geometry',async()=>{
  const vite=await server();
  try {
    const {warpWardrobeGeometry}=await vite.ssrLoadModule('/src/game/characters/warpWardrobeGeometry.ts');
    const source=new BufferGeometry().setAttribute('position',new Float32BufferAttribute([1,2,3,4,5,6],3))
      .setAttribute('normal',new Float32BufferAttribute([0,0,1,0,0,1],3));let calls=0;
    const fitted=warpWardrobeGeometry((x,y,z,p)=>{calls++;return p.set(x*2,y,z);},new Uint8Array([0,1]))(source);
    assert.equal(calls,7,'only the selected point and its six derivative samples run');
    assert.deepEqual([...fitted.attributes.position.array],[1,2,3,8,5,6]);
    assert.deepEqual([...source.attributes.position.array],[1,2,3,4,5,6]);
    assert.equal(warpWardrobeGeometry((x,y,z,p)=>p.set(x*2,y,z),new Uint8Array(2))(source),undefined);
    fitted.dispose();source.dispose();
  }finally{await vite.close();}
});

test('cold and warm fitting geometry remains byte-exact against the accepted pre-cache assets on both tiers',async t=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/wardrobe-fit-signatures.json',import.meta.url),'utf8'));
  const vite=await server(),scenes=new Map();
  const load=async path=>{
    if(!scenes.has(path)){const data=await readFile(new URL('../public/'+path.replace(/^\//,''),import.meta.url));
      if(data.toString('ascii',0,4)!=='glTF')throw Error('Git LFS pointer: '+path);
      scenes.set(path,await loadWardrobeGeometry(data));}
    return scenes.get(path);
  };
  try {
    const api=Object.assign({},...await Promise.all(['villagerModel','characterCatalog','wardrobe','wardrobeGarments','wardrobeFitCache']
      .map(name=>vite.ssrLoadModule('/src/game/characters/'+name+'.ts'))));
    const donor=(await load('models/characters/female/wardrobe/vesper-body.glb')).getObjectByName('BODY_WARDROBE');
    for(const sample of fixture.cases){
      const options={fitted:true,animateFace:true,wetEyes:true},choice={...api.DEFAULT_CHARACTER};
      let actor;
      if(sample.bundled){actor=await load(`models/characters/wardrobe/${sample.bundled}.${sample.tier==='portrait'?'mobile':'garage'}.glb`);choice.wardrobe={set:sample.bundled,shirt:'none',waist:'tucked'};}
      else {
        actor=await load(`models/characters/villagers/villager-female/villager-female.${sample.tier}.glb`);
        options.garmentBody=donor;choice.garments={skirt:sample.skirt};
        const item=api.getWardrobeGarment(sample.skirt),url=api.wardrobeGarmentModelUrl(item,sample.tier);
        options.garments=[{item,scene:await load(url),authoredFit:url===item.revisionUrl}];
        if(sample.corset){choice.wardrobeTrial={set:sample.corset,shirt:'none',waist:'tucked'};options.corsetSource={set:sample.corset,scene:await load(api.corsetModelUrl(choice.wardrobeTrial,sample.tier))};}
      }
      const look=api.characterLook(choice);api.wardrobeFitCache.clear();
      for(const pass of ['cold','warm']){
        const model=api.prepareVillager(actor,options);
        try{api.applyVillagerLook(model,look);assert.equal(geometryDigest(model.root),sample.sha256,`${sample.id} ${pass}: accepted geometry stays exact`);}
        finally{model.dispose();}
      }
      assert(api.wardrobeFitCache.stats.hits>0,`${sample.id}: the second model reuses a bounded fit snapshot`);
      assert(api.wardrobeFitCache.stats.bytes<=api.wardrobeFitCache.maxBytes);
    }
  }catch(error){
    if((error.code==='ENOENT'||error.message.startsWith('Git LFS pointer:'))&&process.env.AVENLAB_WARDROBE_REQUIRE_ASSETS!=='1')return t.skip(error.message);
    throw error;
  }finally{await vite.close();}
});

export {geometryDigest};
