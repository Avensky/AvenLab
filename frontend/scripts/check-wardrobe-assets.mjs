import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createServer} from 'vite';
const dir=process.argv[2];if(!dir)throw Error('Usage: check-wardrobe-assets.mjs directory');
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
const rows=[];
try{
 const {prepareVillager,applyVillagerLook}=await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
 const {DEFAULT_CHARACTER,characterLook}=await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
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
  const model=prepareVillager(scene,{female:true});const counts=[];
  const {withClothingColors}=await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
  const dyed=withClothingColors({...DEFAULT_CHARACTER,wardrobe:{set,shirt:'over',waist:'tucked'}},'corset',{color:'#ff0066',accent:'#ff0066'});
  applyVillagerLook(model,characterLook(dyed));
  let dyedMeshes=0;model.root.traverse(o=>{if(o.isMesh&&o.userData.clothingPiece==='corset'){for(const m of(Array.isArray(o.material)?o.material:[o.material]))assert.equal(m.color.getHexString(),'ff0066');dyedMeshes++;}});assert(dyedMeshes>2,'multi-material corsets all receive the piece dye');
  for(const node of doc.getRoot().listNodes().filter(n=>String(n.getExtras().wardrobeRole).startsWith('corset')&&n.getExtras().fit_version===5))for(const p of node.getMesh().listPrimitives()){
   const joints=p.getAttribute('JOINTS_0').getArray(),weights=p.getAttribute('WEIGHTS_0').getArray();
   for(let i=0;i<joints.length;i++)if(weights[i]>1e-5)assert(joints[i]<=5,'v5 corset straps never follow arm or twist joints');
  }

  for(const shirt of ['none','under','over'])for(const waist of ['tucked','over']){
   const look=characterLook({...DEFAULT_CHARACTER,wardrobe:{set,shirt,waist}});applyVillagerLook(model,look);
   assert(model.root.getObjectByName('CLOTH_UNDER_MODESTY_SHORTS').visible);
   if(n===4&&shirt==='none')assert(model.root.getObjectByName('CLOTH_SHIRT_UNDER').visible);
   let triangles=0,draws=0;
   model.root.traverse(o=>{if(!o.isMesh)return;for(let a=o;a;a=a.parent)if(!a.visible)return;const g=o.geometry;triangles+=Math.min(g.drawRange.count,g.index?.count??g.attributes.position.count)/3;draws+=Array.isArray(o.material)?g.groups.length:1;});
   counts.push({shirt:look.wardrobe.shirt,waist,triangles,draws});
  }
  model.dispose();rows.push({set,lod,bytes:original.length,modes:counts});console.log(set,lod,counts.map(c=>c.triangles).join(','));
 }
 await writeFile(join(dir,'asset-validation.json'),JSON.stringify({passed:true,models:rows},null,2)+'\n');
}finally{await vite.close();}
