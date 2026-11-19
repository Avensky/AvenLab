import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BatchedMesh, BoxGeometry, DirectionalLight, DoubleSide, Frustum, Group, Matrix4, Mesh, MeshPhysicalMaterial, OrthographicCamera, PerspectiveCamera, PointLight, SpotLight } from 'three';
import { createCityInstances } from '../src/world/cityInstances.ts';
import { collectCityShadowFrusta } from '../src/world/cityShadows.ts';
import { warmCityMesh } from '../src/world/cityDrawBatches.ts';

const visual={id:'blocks',asset:'city.glb',position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]};
const placement=(x,z,level='full')=>({chunk:{x,z,origin:[x,0,z]},visual:{...visual},blocks:{Block_0_0:level,Block_1_0:level}});
const frustumAt=(x=0)=>{
 const camera=new PerspectiveCamera(60,1,.1,100);camera.position.x=x;camera.lookAt(x,0,-1);camera.updateMatrixWorld(true);
 return new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
};
function fixture(options={},reduced=true){
 const source=new Group(),low=new Group(),geometry=new BoxGeometry(2,4,2),lowGeometry=new BoxGeometry(2,4,2),material=new MeshPhysicalMaterial();
 const lowMaterial=new MeshPhysicalMaterial();material.name='shared bricks';
 for(let i=0;i<2;i++){
  const block=new Group();block.name=`Block_${i}_0`;source.add(block);
  const mesh=new Mesh(geometry,material);mesh.name=`facade-${i}`;mesh.position.x=i*4;block.add(mesh);
  const other=new Mesh(lowGeometry,lowMaterial);other.name=mesh.name;low.add(other);
 }
 const asset=createCityInstances(source,3,true,reduced?low:undefined,options);asset.objects.forEach(asset.prepareMesh);
 const disposeSource=()=>{geometry.dispose();lowGeometry.dispose();material.dispose();lowMaterial.dispose();};
 return {asset,source,disposeSource,dispose:()=>{asset.dispose();disposeSource();}};
}

test('new plans and detail dictionaries reuse static transforms and unchanged GPU matrices',()=>{
 const f=fixture(),{asset}=f;
 const entries=[placement(0,-10),placement(0,-20,'reduced')];asset.update(entries,new Frustum(),false);
 const matrices=asset.batches.map(b=>b.matrices),boxes=asset.batches.map(b=>b.boxes);
 const versions=asset.batches.map(b=>[b.mesh.instanceMatrix.version,b.reduced.instanceMatrix.version]);
 const copied=structuredClone(entries);asset.update(copied,new Frustum(),false);
 assert.equal(asset.stats.transformRebuilds,1);
 asset.batches.forEach((b,i)=>{assert.equal(b.matrices,matrices[i]);assert.equal(b.boxes,boxes[i]);});
 assert.deepEqual(asset.batches.map(b=>[b.mesh.instanceMatrix.version,b.reduced.instanceMatrix.version]),versions);
 copied[0].blocks.Block_0_0='proxy';asset.update(copied,new Frustum(),false);
 assert.equal(asset.stats.transformRebuilds,1,'a detail change does not rebuild authored transforms');
 assert.equal(asset.batches[0].mesh.count,0);assert.equal(asset.batches[1].mesh.instanceMatrix.version,versions[1][0]);
 copied[1].visual.position=[5,0,0];asset.update(copied,new Frustum(),false);
 assert.equal(asset.stats.transformRebuilds,2,'an actual transform edit is detected even on the same array');
 const matrix=new Matrix4();asset.batches[0].reduced.getMatrixAt(0,matrix);assert.equal(matrix.elements[12],5);
 f.dispose();
});

test('native multi-draw groups compatible opaque geometry while preserving per-block full/reduced visibility',()=>{
 const f=fixture({multiDraw:true}),{asset}=f;const jobs=asset.prepareDrawBatches();assert.equal(jobs.length,2);jobs.forEach(job=>job());
 assert.deepEqual(asset.prepareDrawBatches(),[],'preparation cannot pack the same parts twice');
 assert.equal(asset.meshes.length,2);assert.ok(asset.meshes.every(mesh=>mesh instanceof BatchedMesh));
 assert.equal(asset.group.children.length,2);assert.equal(asset.meshes[0].material,asset.meshes[1].material);
 const entries=[placement(0,-10),placement(0,-20,'reduced')];asset.update(entries,new Frustum(),true);
 for(const batch of asset.batches){
  const high=batch.fullDraw.binding,low=batch.reducedDraw.binding;
  assert.equal(high.mesh.getVisibleAt(high.ids[0]),true);assert.equal(high.mesh.getVisibleAt(high.ids[1]),false);
  assert.equal(low.mesh.getVisibleAt(low.ids[0]),true);assert.equal(low.mesh.getVisibleAt(low.ids[1]),false);
  const matrix=new Matrix4();low.mesh.getMatrixAt(low.ids[0],matrix);assert.equal(matrix.elements[14],-20);
  assert.equal(high.mesh.castShadow,true);assert.equal(low.mesh.castShadow,false);
 }
 let matrixWrites=0;asset.meshes.forEach(mesh=>{const write=mesh.setMatrixAt.bind(mesh);mesh.setMatrixAt=(...args)=>{matrixWrites++;return write(...args);};});
 asset.update(structuredClone(entries),new Frustum(),true);assert.equal(matrixWrites,0);
 entries[0].blocks.Block_0_0='proxy';entries[1].blocks.Block_1_0='full';asset.update(entries,new Frustum(),true);
 assert.equal(asset.batches[0].fullDraw.binding.mesh.getVisibleAt(asset.batches[0].fullDraw.binding.ids[0]),false);
 assert.equal(asset.batches[1].reducedDraw.binding.mesh.getVisibleAt(asset.batches[1].reducedDraw.binding.ids[0]),false);
 assert.equal(asset.batches[1].fullDraw.binding.count,2);
 f.dispose();
});

test('browsers without native multi-draw retain instancing without allocating packed geometry',()=>{
 const f=fixture({multiDraw:false});assert.deepEqual(f.asset.prepareDrawBatches(),[]);assert.equal(f.asset.meshes.length,4);
 assert.ok(f.asset.meshes.every(mesh=>mesh.isInstancedMesh));f.dispose();
});

test('transparent materials and incompatible vertex layouts retain separate instance draws',()=>{
 const f=fixture({multiDraw:true},false);f.source.children[0].children[0].material.transparent=true;
 // Materials are cloned during preparation, so use a new preparation for this source.
 const asset=createCityInstances(f.source,3,true,undefined,{multiDraw:true});asset.objects.forEach(asset.prepareMesh);
 assert.deepEqual(asset.prepareDrawBatches(),[]);asset.dispose();f.dispose();
 const g=fixture({multiDraw:true},false);g.asset.batches[1].mesh.geometry=g.asset.batches[1].mesh.geometry.clone();
 g.asset.batches[1].mesh.geometry.deleteAttribute('normal');assert.deepEqual(g.asset.prepareDrawBatches(),[]);
 g.asset.batches[1].mesh.geometry.dispose();g.dispose();
});

test('shadow culling keeps offscreen casters only when a light can see them; roads and glass only receive',()=>{
 const f=fixture({},false),{asset}=f;const entries=[placement(0,-10),placement(1000,-10),placement(-1000,-10)];
 assert.equal(asset.update(entries,frustumAt(),true,[frustumAt(1000)]),4);
 assert.equal(asset.batches[0].mesh.count,2,'visible facade plus the offscreen light-facing facade');
 assert.equal(asset.update(entries,frustumAt(),true,[]),2,'no light needs the offscreen facades');
 f.dispose();
 const road=fixture({castShadow:false},false);road.asset.update(entries,frustumAt(),true,[frustumAt(1000)]);
 assert.equal(road.asset.batches[0].mesh.count,1);assert.equal(road.asset.batches[0].mesh.castShadow,false);assert.equal(road.asset.batches[0].mesh.receiveShadow,true);road.dispose();
 const source=new Group(),geometry=new BoxGeometry(),glass=new MeshPhysicalMaterial();glass.name='Glass';source.add(new Mesh(geometry,glass));
 const a=createCityInstances(source,1,true);a.objects.forEach(a.prepareMesh);a.update([placement(0,-10)],new Frustum(),true);
 assert.equal(a.meshes[0].castShadow,false);assert.equal(a.meshes[0].receiveShadow,true);a.dispose();geometry.dispose();glass.dispose();
});

test('shadow volumes follow visible directional/spot/point lights and reuse frustum objects',()=>{
 const scene=new Group(),sun=new DirectionalLight(),spot=new SpotLight(),point=new PointLight();
 sun.position.set(0,20,0);sun.target.position.set(0,0,0);sun.castShadow=true;sun.shadow.camera=new OrthographicCamera(-10,10,10,-10,.1,100);
 spot.position.set(10,10,0);spot.castShadow=true;point.position.set(-10,5,0);point.castShadow=true;
 scene.add(sun,sun.target,spot,spot.target,point);scene.updateMatrixWorld(true);
 const result=collectCityShadowFrusta(scene,[]);assert.equal(result.length,8);const first=result[0];
 sun.position.x=5;collectCityShadowFrusta(scene,result);assert.equal(result[0],first);
 point.visible=false;collectCityShadowFrusta(scene,result);assert.equal(result.length,2);
 spot.castShadow=false;collectCityShadowFrusta(scene,result);assert.equal(result.length,1);
});

test('fallback caster bounds follow packed instances when lights, placements and shadow settings change', () => {
  const f = fixture({multiDraw: false}, false);
  const mesh = f.asset.batches[0].mesh;
  const player = frustumAt(), light = frustumAt(1000);
  const near = placement(0, -10), far = placement(1000, -10);
  f.asset.update([near], player, false);
  f.asset.update([near], player, true, [light]);
  assert.equal(mesh.frustumCulled, true);
  assert.equal(player.intersectsObject(mesh), true);
  assert.equal(light.intersectsObject(mesh), false);
  const sphere = mesh.boundingSphere;
  f.asset.update([near, far], player, true, [light]);
  assert.equal(mesh.boundingSphere, sphere);
  assert.equal(mesh.count, 2);
  assert.equal(light.intersectsObject(mesh), true);
  f.asset.update([near, far], player, true, []);
  assert.equal(mesh.count, 1);
  assert.equal(light.intersectsObject(mesh), false);
  f.asset.update([far], player, true, [light]);
  assert.equal(mesh.count, 1, 'offscreen caster remains packed for the light');
  assert.equal(player.intersectsObject(mesh), false);
  assert.equal(light.intersectsObject(mesh), true);
  // Repack while shadows are off, then re-enable with unchanged membership.
  f.asset.update([near], player, false);
  f.asset.update([near], player, true, [light]);
  assert.equal(player.intersectsObject(mesh), true);
  assert.equal(light.intersectsObject(mesh), false);
  f.dispose();
});

test('only the authored two-sided road decals opt into one blended pass on Fast and Balanced', () => {
  const cityPath = '/models/chuncks/chunck_0,0_2x2_roads.glb';
  const source = new Group(), geometry = new BoxGeometry();
  const roadPaint = new MeshPhysicalMaterial({transparent: true, opacity: .6, side: DoubleSide, depthWrite: false});
  roadPaint.name = 'MarkingRoad.001';
  const other = roadPaint.clone();
  other.name = 'shop window';
  source.add(new Mesh(geometry, roadPaint), new Mesh(geometry, other));
  for (const fast of [true, false]) {
    for (const assetPath of [cityPath, '/custom/roads.glb']) {
      const asset = createCityInstances(source, 1, fast, undefined, {assetPath, multiDraw: true});
      asset.objects.forEach(asset.prepareMesh);
      const [decal, window] = asset.meshes.map(mesh => mesh.material);
      assert.equal(decal.forceSinglePass, assetPath === cityPath);
      assert.equal(window.forceSinglePass, false);
      assert.equal(decal.side, DoubleSide);
      assert.equal(decal.opacity, .6);
      assert.equal(decal.depthWrite, false);
      assert.equal(decal.transparent, true);
      assert.deepEqual(asset.prepareDrawBatches(), []);
      asset.dispose();
    }
  }
  assert.equal(roadPaint.forceSinglePass, false);
  geometry.dispose(); roadPaint.dispose(); other.dispose();
});

test('single-pass road materials still reference flat blended decals in both shipped texture tiers', t => {
  for (const size of [512, 1024]) {
    const path = new URL(`../public/models/chuncks/chunck_0,0_2x2_roads_textures${size}.glb`, import.meta.url);
    const bytes = readFileSync(path);
    if (bytes.subarray(0, 7).toString() === 'version') return t.skip('Materialize the city road GLBs with Git LFS');
    assert.equal(bytes.subarray(0, 4).toString(), 'glTF');
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const names = new Set();
    for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
      const material = gltf.materials[primitive.material];
      if (!/^MarkingRoad\.00[123]$/.test(material.name)) continue;
      assert.equal(material.alphaMode, 'BLEND');
      assert.equal(material.doubleSided, true);
      const bounds = gltf.accessors[primitive.attributes.POSITION];
      assert.equal(bounds.min[1], bounds.max[1], material.name);
      names.add(material.name);
    }
    assert.deepEqual([...names].sort(), ['MarkingRoad.001', 'MarkingRoad.002', 'MarkingRoad.003']);
  }
});

test('batch warmup never leaves a phantom identity instance visible and disposes only owned GPU buffers',()=>{
 const f=fixture({multiDraw:true}),{asset}=f;asset.prepareDrawBatches().forEach(job=>job());
 const packed=asset.meshes[0];let disposed=0,sourceDisposals=0;
 packed.geometry.addEventListener('dispose',()=>disposed++);f.source.children[0].children[0].geometry.addEventListener('dispose',()=>sourceDisposals++);
 warmCityMesh(packed,true);assert.equal(packed.getVisibleAt(0),true);warmCityMesh(packed,false);assert.equal(packed.getVisibleAt(0),false);
 asset.update([placement(0,-10,'proxy')],new Frustum(),false);assert.equal(packed.getVisibleAt(0),false);
 asset.dispose();assert.equal(disposed,1);assert.equal(sourceDisposals,0);
 f.disposeSource();
});

test('empty material batches do not render and shared batches stay visible for active sibling parts',()=>{
 const f=fixture({multiDraw:true},false),{asset}=f;
 asset.prepareDrawBatches().forEach(job=>job());
 assert.equal(asset.meshes.length,1);
 const shared=asset.meshes[0];
 asset.update([placement(0,-10,'proxy')],frustumAt(),false);
 assert.equal(shared.visible,false,'all proxy placements disable the shared draw');
 asset.update([placement(0,-10,'full')],frustumAt(),false);
 assert.equal(shared.visible,true,'visible placements enable the shared draw');
 asset.update([placement(1000,-10,'full')],frustumAt(),false);
 assert.equal(shared.visible,false,'frustum-culling the last placement disables the shared draw');
 f.dispose();
});
