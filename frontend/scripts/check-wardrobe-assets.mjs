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
 const {DEFAULT_CHARACTER,OUTFIT_THEMES,characterAppearance,characterLook}=await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
 const {withClothingColors}=await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
 const {buildEmoteClips,findGaragePreviewEmote}=await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
 const gothicPink=OUTFIT_THEMES.find(theme=>theme.name==='Gothic Pink');
 const appearance={...characterAppearance(DEFAULT_CHARACTER),color:gothicPink.color,accent:gothicPink.accent};
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
  const ruffledTrim=n===3&&model.root.getObjectByName('CLOTH_GOTHIC_03_TRIM_TUCKED');
  const ruffledOver=ruffledTrim?.parent?.children.find(part=>part.userData.wardrobeRole==='bottom-trim-over');
  if(n===3){
   assert(ruffledTrim?.isSkinnedMesh&&ruffledOver?.isSkinnedMesh,'Ruffled skirt has trim for each fit');
   assert.deepEqual(ruffledOver.geometry.index.array,scene.getObjectByName(ruffledOver.name).geometry.index.array,'Ruffled over-skirt trim keeps its authored triangles');
   assert(ruffledTrim.geometry.index.count>0&&ruffledTrim.geometry.index.count<ruffledOver.geometry.index.count,'Ruffled tucked trim keeps its lower ruffles');
   const positions=ruffledTrim.geometry.attributes.position;
   for(const vertex of ruffledTrim.geometry.index.array)assert(positions.getY(vertex)<=1.06,'Ruffled tucked trim stays below the waist');
  }
  // Keep authored UVs and limit each fit change to its affected panels.
  for(const name of ['CLOTH_CORSET_TUCKED','CLOTH_CORSET_OVER']){
   const tuckRefit=(n===2||n===3)&&name==='CLOTH_CORSET_TUCKED';
   const authored=scene.getObjectByName(name), fitted=model.root.getObjectByName(name);
   authored.traverse(source=>{
    if(!source.isSkinnedMesh)return;
    const target=fitted.getObjectByName(source.name);
    assert(target?.isSkinnedMesh);
    const cupRefit=n===2&&source.material.userData.color_slot==='fabric';
    for(const attribute of ['position','normal','uv','skinIndex','skinWeight']){
     if((tuckRefit||cupRefit)&&attribute==='position')continue;
     if(n===5&&['position','skinIndex','skinWeight'].includes(attribute))continue;
     assert.deepEqual(target.geometry.getAttribute(attribute)?.array,source.geometry.getAttribute(attribute)?.array,`${set} ${lod} ${source.name} ${attribute} stays authored`);
    }
    if(n===5){
     const positions=source.geometry.attributes.position;
     for(let i=0;i<positions.count;i++){
      const z=positions.getZ(i),y=positions.getY(i);
      const inShoulder= y>(z<-.023?1.235:1.285)&&Math.abs(positions.getX(i))>.058&&z<.067;
      const weight=target.geometry.attributes.skinWeight;
      assert(Math.abs(weight.getX(i)+weight.getY(i)+weight.getZ(i)+weight.getW(i)-1)<1e-4,'High Collar strap weights remain normalized');
      if(inShoulder){
       const fittedPosition=target.geometry.attributes.position;
       assert(Math.hypot(fittedPosition.getX(i)-positions.getX(i),fittedPosition.getY(i)-y,fittedPosition.getZ(i)-z)<=.014001,'High Collar strap clearance is bounded');
       continue;
      }
      for(const attr of ['position','skinIndex','skinWeight']){
       const before=source.geometry.attributes[attr],after=target.geometry.attributes[attr];
       for(let c=0;c<before.itemSize;c++)assert.equal(after.getComponent(i,c),before.getComponent(i,c),'High Collar refit stays local to the shoulders');
      }
     }
    }
    if(tuckRefit||cupRefit){
     const before=source.geometry.getAttribute('position'),after=target.geometry.getAttribute('position');
     assert.equal(after.count,before.count);
     const tuckTop=n===2?1.238:1.217,clearance=n===2?.011001:.007001;
     for(let i=0;i<after.count;i++){
      const x=before.getX(i),y=before.getY(i),z=before.getZ(i);
      assert.equal(after.getY(i),y,'the refit preserves hem and cup height');
      if(tuckRefit&&y<tuckTop){
       assert(Math.hypot(after.getX(i)-x,after.getZ(i)-z)<=clearance,'tucked waist refit is bounded');
      }else{
       assert.equal(after.getX(i),x);
       if(cupRefit&&x>-.132&&x<-.023&&z>.025&&y>1.266)assert(after.getZ(i)>=z&&after.getZ(i)-z<=.045,'right cup only moves outward');
       else assert.equal(after.getZ(i),z,'other regions stay authored');
      }
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
   const look=characterLook({...DEFAULT_CHARACTER,appearance,wardrobe:{set,shirt:'none',waist}});applyVillagerLook(model,look);
   assert.equal(shorts.visible,false,'complete Gothic outfits hide the standalone shorts');
   if(facing)assert(facing.visible);
   if(n===2)for(const fit of ['tucked','over'])assert.equal(model.root.getObjectByName(`CLOTH_GOTHIC_02_WAIST_SEAM_${fit.toUpperCase()}`).visible,fit===waist);
   if(n===3){
    assert.equal(ruffledTrim.visible,waist==='tucked');
    assert.equal(ruffledOver.visible,waist==='over');
    assert.equal(ruffledTrim.material.color.getHexString(),gothicPink.accent.slice(1),'lower ruffles still take the accent dye');
    const seam=model.root.getObjectByName('CLOTH_GOTHIC_03_WAIST_SEAM_TUCKED');
    assert.equal(seam.visible,waist==='tucked');
    assert.equal(seam.material.color.getHexString(),gothicPink.color.slice(1),'the Ruffled waist seam takes the main dye');
   }
   if(n===4){
    const fit=waist.toUpperCase(),vest=model.root.getObjectByName(`CLOTH_CORSET_${fit}`);
    const lining=vest.getObjectByName(`CLOTH_CORSET_04_LINING_${fit}`);
    assert(lining?.isSkinnedMesh&&lining.geometry.index.count>0,'the Underbust lining has its own draw');
    assert.equal(lining.material.color.getHexString(),gothicPink.color.slice(1),'the Underbust lining takes the main dye');
    const piping=vest.children.find(part=>part.isSkinnedMesh&&part.material.name==='MAT_CORSET_04_00.001');
    assert(piping?.geometry.index.count>0,'the Underbust keeps its piping');
    assert.equal(piping.material.color.getHexString(),gothicPink.accent.slice(1),'the Underbust piping takes the accent dye');
   }
   const bindBody=scene.getObjectByName('BODY_WARDROBE').geometry;
   if(n!==3||waist==='tucked')verifyCorsetCoverage(model.root,`${set} ${lod} ${waist}`,n,buildEmoteClips,findGaragePreviewEmote,bindBody,waist==='tucked');
   let triangles=0,draws=0;
   model.root.traverse(o=>{if(!o.isMesh)return;for(let a=o;a;a=a.parent)if(!a.visible)return;const g=o.geometry;triangles+=Math.min(g.drawRange.count,g.index?.count??g.attributes.position.count)/3;draws+=Array.isArray(o.material)?g.groups.length:1;});
   counts.push({shirt:look.wardrobe.shirt,waist,triangles,draws});
  }
  model.dispose();rows.push({set,lod,bytes:original.length,modes:counts});console.log(set,lod,counts.map(c=>c.triangles).join(','));
 }
 await writeFile(join(dir,'asset-validation.json'),JSON.stringify({passed:true,models:rows},null,2)+'\n');
}finally{await vite.close();}
