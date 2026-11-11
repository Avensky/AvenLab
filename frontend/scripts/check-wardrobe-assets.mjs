import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createServer} from 'vite';
import {verifyCorsetCoverage} from './verify-corset-coverage.mjs';
const dir=process.argv[2];if(!dir)throw Error('Usage: check-wardrobe-assets.mjs directory');
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
const rows=[];
try{
 const {prepareVillager,applyVillagerLook}=await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
 const {DEFAULT_CHARACTER,characterLook}=await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
 const {buildEmoteClips,findGaragePreviewEmote}=await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
 for(let n=1;n<=5;n++)for(const lod of ['garage','mobile']){
  const set=`gothic-${String(n).padStart(2,'0')}`,file=join(dir,`${set}.${lod}.glb`),doc=await io.read(file);
  assert.equal(doc.getRoot().listSkins().length,1);assert.equal(doc.getRoot().listSkins()[0].listJoints().length,88);
  const roles=new Set(doc.getRoot().listNodes().map(n=>n.getExtras().wardrobeRole));
  for(const role of ['body','bottom','shorts','corset-tucked','corset-over','shirt-under','shirt-over-tucked','shirt-over-over'])assert(roles.has(role),role);
  for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
   assert(p.getAttribute('JOINTS_0'));assert(p.getAttribute('WEIGHTS_0'));
   for(const v of p.getAttribute('POSITION').getArray())assert(Number.isFinite(v));
   const weights=p.getAttribute('WEIGHTS_0').getArray();
   for(let i=0;i<weights.length;i+=4)assert(Math.abs(weights[i]+weights[i+1]+weights[i+2]+weights[i+3]-1)<1e-4);
   const flags=p.getAttribute('_AVEN_COVERAGE');if(flags)for(const f of flags.getArray())assert(Number.isInteger(f)&&f>=0&&f<=63);
  }
  // Test the actual Three loader and clone/mask code without requiring image decoding in Node.
  const original=await readFile(file),len=original.readUInt32LE(12),json=JSON.parse(original.subarray(20,20+len));
  for(const m of json.materials??[]){delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;delete m.extensions;if(m.pbrMetallicRoughness){delete m.pbrMetallicRoughness.baseColorTexture;delete m.pbrMetallicRoughness.metallicRoughnessTexture;}}
  delete json.textures;delete json.images;
  for(const key of ['extensionsUsed','extensionsRequired'])json[key]=json[key]?.filter(e=>e!=='EXT_texture_webp');
  const text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);
  const bin=original.subarray(20+len),header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(20+padded.length+bin.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const bytes=Buffer.concat([header,padded,bin]);const {scene}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const model=prepareVillager(scene,{female:true,fitted:true});const counts=[];
  const facing=model.root.getObjectByName('CLOTH_CORSET_FACING');
  const shorts=model.root.getObjectByName('CLOTH_UNDER_MODESTY_SHORTS');
  const shoes=model.root.getObjectByName('CLOTH_FEET_SHOES');
  model.root.traverse(part=>assert(!['shirt-under','shirt-over-tucked','shirt-over-over'].includes(part.userData.wardrobeRole),'legacy shirts are removed by role'));
  assert(facing?.isSkinnedMesh,'fitted corset coverage uses the body rig');
  if(n===2){
   const skirt=model.root.getObjectByName('CLOTH_BOTTOM_SKIRT');
   const materials=[];
   skirt.traverse(part=>{if(part.isMesh)materials.push(part.material.name);});
   assert.deepEqual(materials,['MAT_GOTHIC_02_Fabric_0','MAT_GOTHIC_02_WaistSeam','MAT_GOTHIC_02_WaistSeam'],'Sweetheart skirt keeps its fabric and a matching seam per fit');
   for(const fit of ['TUCKED','OVER']){
    const seam=skirt.getObjectByName(`CLOTH_GOTHIC_02_WAIST_SEAM_${fit}`);
    seam.geometry.computeBoundingBox();
    assert(seam.geometry.boundingBox.max.y<1.12,'the waist seam cannot cover the corset midsection');
   }
   facing.geometry.computeBoundingBox();
   assert(facing.geometry.boundingBox.min.y>1.25,'Sweetheart cup backing stops above the waist');
   assert(facing.geometry.boundingBox.min.z>.06,'Sweetheart cup backing stays in front');
  }
  // Keep authored UVs and rigging. Sweetheart's tucked torso moves as a whole
  // across materials, and its cups and over-skirt version retain the source fit.
  for(const name of ['CLOTH_CORSET_TUCKED','CLOTH_CORSET_OVER']){
   const authored=scene.getObjectByName(name), fitted=model.root.getObjectByName(name);
   authored.traverse(source=>{
    if(!source.isSkinnedMesh)return;
    const target=fitted.getObjectByName(source.name);
    assert(target?.isSkinnedMesh);
    for(const attribute of ['position','normal','uv','skinIndex','skinWeight']){
     if(n===2&&name==='CLOTH_CORSET_TUCKED'&&attribute==='position')continue;
     assert.deepEqual(target.geometry.getAttribute(attribute)?.array,source.geometry.getAttribute(attribute)?.array,`${set} ${lod} ${source.name} ${attribute} stays authored`);
    }
    if(n===2&&name==='CLOTH_CORSET_TUCKED'){
     const before=source.geometry.getAttribute('position'),after=target.geometry.getAttribute('position');
     assert.equal(after.count,before.count);
     for(let i=0;i<after.count;i++){
      assert.equal(after.getY(i),before.getY(i),'tucked refit preserves hem and cup height');
      if(before.getY(i)>=1.238){assert.equal(after.getX(i),before.getX(i));assert.equal(after.getZ(i),before.getZ(i));}
      else assert(Math.hypot(after.getX(i)-before.getX(i),after.getZ(i)-before.getZ(i))<=.011001,'tucked refit is bounded');
     }
    }
   });
  }
  if(facing){
   assert(facing.isSkinnedMesh && facing.geometry.index.count>0);
   assert.equal(facing.material.transparent,false,'the corset facing must remain opaque');
   const weights=facing.geometry.getAttribute('skinWeight');
   for(let i=0;i<weights.count;i++)assert(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<1e-4);
  }
  assert(shoes.isSkinnedMesh);
  const shoeBounds=shoes.geometry.boundingBox;
  const sourceSole=doc.getRoot().listNodes().find(node=>node.getName()==='CLOTH_FEET_SHOES').getMesh().listPrimitives()[0].getAttribute('POSITION').getMin([])[1];
  assert(Math.abs(shoeBounds.min.y-sourceSole)<1e-6,'larger shoes keep the original sole height');
  assert(shoeBounds.max.x>.197&&shoeBounds.min.x<-.197&&shoeBounds.min.z<-.098,'shoes cover both heels and outer feet');
  const {withClothingColors}=await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
  if(n===2){
   const pinkAccent=withClothingColors({...DEFAULT_CHARACTER,wardrobe:{set,shirt:'none',waist:'tucked'}},'skirt',{color:'#335577',accent:'#ff2d95'});
   applyVillagerLook(model,characterLook(pinkAccent));
   model.root.getObjectByName('CLOTH_BOTTOM_SKIRT').traverse(part=>{
    if(part.isMesh)assert.equal(part.material.color.getHexString(),'335577','pink trim cannot color the Sweetheart waist seam');
   });
  }
  const dyed=withClothingColors({...DEFAULT_CHARACTER,wardrobe:{set,shirt:'none',waist:'tucked'}},'corset',{color:'#ff0066',accent:'#ff0066'});
  applyVillagerLook(model,characterLook(dyed));
  let dyedMeshes=0;model.root.traverse(o=>{if(o.isMesh&&o.userData.clothingPiece==='corset'){for(const m of(Array.isArray(o.material)?o.material:[o.material]))assert.equal(m.color.getHexString(),'ff0066');dyedMeshes++;}});assert(dyedMeshes>2,'multi-material corsets all receive the piece dye');
  for(const node of doc.getRoot().listNodes().filter(n=>String(n.getExtras().wardrobeRole).startsWith('corset')&&n.getExtras().fit_version===5))for(const p of node.getMesh().listPrimitives()){
   const joints=p.getAttribute('JOINTS_0').getArray(),weights=p.getAttribute('WEIGHTS_0').getArray();
   for(let i=0;i<joints.length;i++)if(weights[i]>1e-5)assert(joints[i]<=5,'v5 corset straps never follow arm or twist joints');
  }

  for(const waist of ['tucked','over']){
   const look=characterLook({...DEFAULT_CHARACTER,wardrobe:{set,shirt:'none',waist}});applyVillagerLook(model,look);
   assert.equal(shorts.visible,false,'complete Gothic outfits hide the standalone shorts');
   if(facing)assert(facing.visible);
   if(n===2)for(const fit of ['tucked','over'])assert.equal(model.root.getObjectByName(`CLOTH_GOTHIC_02_WAIST_SEAM_${fit.toUpperCase()}`).visible,fit===waist);
   const tuckBindBody=n===2&&waist==='tucked'?scene.getObjectByName('BODY_WARDROBE').geometry:undefined;
   if(n!==3)verifyCorsetCoverage(model.root,`${set} ${lod} ${waist}`,n,buildEmoteClips,findGaragePreviewEmote,tuckBindBody);
   let triangles=0,draws=0;
   model.root.traverse(o=>{if(!o.isMesh)return;for(let a=o;a;a=a.parent)if(!a.visible)return;const g=o.geometry;triangles+=Math.min(g.drawRange.count,g.index?.count??g.attributes.position.count)/3;draws+=Array.isArray(o.material)?g.groups.length:1;});
   counts.push({shirt:look.wardrobe.shirt,waist,triangles,draws});
  }
  model.dispose();rows.push({set,lod,bytes:original.length,modes:counts});console.log(set,lod,counts.map(c=>c.triangles).join(','));
 }
 await writeFile(join(dir,'asset-validation.json'),JSON.stringify({passed:true,models:rows},null,2)+'\n');
}finally{await vite.close();}
