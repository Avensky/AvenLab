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
function shoulderEyeletTriangles(geometry, authoredPositions) {
 const lanes={frontLeft:[],frontRight:[],crestLeft:[],crestRight:[],rearLeft:[],rearRight:[]};
 const indices=geometry.index.array;
 for(let i=0;i<indices.length;i+=3){
  const a=indices[i],b=indices[i+1],c=indices[i+2];
  const x=(authoredPositions.getX(a)+authoredPositions.getX(b)+authoredPositions.getX(c))/3;
  const y=(authoredPositions.getY(a)+authoredPositions.getY(b)+authoredPositions.getY(c))/3;
  const z=(authoredPositions.getZ(a)+authoredPositions.getZ(b)+authoredPositions.getZ(c))/3;
  if(y<=1.339||y>=1.435||Math.abs(x)<=.062||Math.abs(x)>=.135||z>=.063)continue;
  const band=z>.015?'front':z<-.021?'rear':'crest';
  lanes[band+(x<0?'Left':'Right')].push(a,b,c);
 }
 return lanes;
}
function triangleKeys(index) {
 const triangles=[];
 for(let i=0;i<index.count;i+=3)triangles.push(`${index.getX(i)},${index.getX(i+1)},${index.getX(i+2)}`);
 return triangles;
}
function verifyWiderVestShell(source, target, splitLining) {
 const original=source.geometry.attributes.position, fitted=target.geometry.attributes.position;
 const trim=source.material.name==='MAT_CORSET_04_00.001', fabric=source.material.name==='MAT_CORSET_04_05.001';
 if(trim)assert(splitLining?.isSkinnedMesh,'Underbust keeps the lining in its own color slot');
 const targetFaces=triangleKeys(target.geometry.index);
 if(trim)targetFaces.push(...triangleKeys(splitLining.geometry.index));
 const faces=new Set(targetFaces), originalIndex=source.geometry.index;
 for(let i=0;i<originalIndex.count;i+=3){
  const a=originalIndex.getX(i), b=originalIndex.getX(i+1), c=originalIndex.getX(i+2);
  if((original.getY(a)+original.getY(b)+original.getY(c))/3<=1.339){
   assert(faces.has(`${a},${b},${c}`),'Underbust keeps every lower shell, placket and trim triangle');
  }
 }
 if(trim||fabric){
  assert(fitted.count>original.count,'Underbust appends reconstructed shoulder faces');
  assert(target.geometry.index.array.some(vertex=>vertex>=original.count),'Underbust draws the reconstructed shoulder faces');
  const sides=[0,0];
  for(let i=original.count;i<fitted.count;i++){
   if(fitted.getY(i)>1.37)sides[fitted.getX(i)<0?0:1]++;
  }
  assert(sides.every(count=>count>4),'Underbust reconstructs both shoulder crowns');
 }else assert.equal(fitted.count,original.count,'Underbust keeps the placket and hardware vertex layout');
 const weights=target.geometry.attributes.skinWeight;
 for(let i=0;i<fitted.count;i++){
  assert(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<1e-4,
   'Underbust vest weights remain normalized');
 }
 const ease=[0,0];
 for(let i=0;i<original.count;i++){
  const x=original.getX(i), y=original.getY(i), z=original.getZ(i);
  const limit=y>1.338&&Math.abs(x)>.090?.075:.040;
  assert(Math.hypot(fitted.getX(i)-x,fitted.getY(i)-y,fitted.getZ(i)-z)<limit,
   'Underbust keeps a close fit around the torso and shoulders');
  if(y<=1.294||Math.abs(x)<=.047)for(const attr of ['skinIndex','skinWeight']){
   const before=source.geometry.attributes[attr], after=target.geometry.attributes[attr];
   for(let c=0;c<before.itemSize;c++)assert.equal(after.getComponent(i,c),before.getComponent(i,c),
    'Underbust weight edits stay at the upper straps and back');
  }
  if(y>1.14&&y<1.30&&Math.abs(x)>.075){
   const side=x<0?0:1;
   ease[side]=Math.max(ease[side],Math.abs(fitted.getX(i))-Math.abs(x));
  }
 }
 if(source.material.name==='MAT_CORSET_04_05.001')assert(ease.every(width=>width>.007),
  'Underbust fabric has room on both sides for a separate top');
}
const rows=[];
try{
 const {prepareVillager,applyVillagerLook}=await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
 const {DEFAULT_CHARACTER,OUTFIT_THEMES,characterAppearance,characterLook}=await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
 const {resolveWardrobe}=await vite.ssrLoadModule('/src/game/characters/wardrobe.ts');
 const {withClothingColors}=await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
 const {buildEmoteClips,findGaragePreviewEmote}=await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
 const gothicPink=OUTFIT_THEMES.find(theme=>theme.name==='Gothic Pink');
 const appearance={...characterAppearance(DEFAULT_CHARACTER),color:gothicPink.color,accent:gothicPink.accent};
 const assetLook=choice=>({...characterLook(choice),wardrobe:resolveWardrobe(choice.wardrobeTrial??choice.wardrobe,{includeRetired:true})});
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
  assert.equal(model.root.getObjectByName('CLOTH_UNDERBUST_BLOUSE'),undefined,'bundled outfits have no default blouse');
  if(n===4){
   assert.equal(facing,undefined,'the Underbust neckline stays open above the authored bodice');
  }else{
   assert(facing?.isSkinnedMesh,'fitted corset coverage uses the body rig');
  }
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
  let sweetheartOverRise=0;
  let collarRemovedIndices=0;
  for(const name of ['CLOTH_CORSET_TUCKED','CLOTH_CORSET_OVER']){
   const tuckRefit=(n===2||n===3)&&name==='CLOTH_CORSET_TUCKED';
   const authored=scene.getObjectByName(name), fitted=model.root.getObjectByName(name);
   if(n===4)assert.equal(authored.userData.source,'z-h_Medieval Corset 04-THIN WELD.fbx');
   authored.traverse(source=>{
    if(!source.isSkinnedMesh)return;
    const target=fitted.getObjectByName(source.name);
    assert(target?.isSkinnedMesh);
    const cupRefit=n===2&&source.material.userData.color_slot==='fabric';
    const sweetheartOver=n===2&&!tuckRefit;
    for(const attribute of ['position','normal','uv','skinIndex','skinWeight']){
     if((tuckRefit||cupRefit||sweetheartOver)&&attribute==='position')continue;
     if(n===4){
      if(attribute==='uv'){
       const authored=source.geometry.getAttribute(attribute)?.array;
       assert.deepEqual(target.geometry.getAttribute(attribute)?.array.subarray(0,authored?.length),authored,
        'Underbust retains the authored UVs at the original vertices');
      }
      continue;
     }
     if(n===5&&['position','skinIndex','skinWeight'].includes(attribute))continue;
     assert.deepEqual(target.geometry.getAttribute(attribute)?.array,source.geometry.getAttribute(attribute)?.array,`${set} ${lod} ${source.name} ${attribute} stays authored`);
    }
    if(n===4)verifyWiderVestShell(source,target,fitted.getObjectByName(`CLOTH_CORSET_04_LINING_${name.split('_').at(-1)}`));
    if(n===5){
     assert(target.geometry.index.count<=source.geometry.index.count,'High Collar keeps the authored lower shell triangles');
     collarRemovedIndices+=source.geometry.index.count-target.geometry.index.count;
     const positions=source.geometry.attributes.position;
     if(source.material.userData.color_slot==='hardware'){
      const authored=shoulderEyeletTriangles(source.geometry,positions);
      assert(Object.values(authored).every(lane=>lane.length>0),'High Collar has authored eyelets on both shoulders');
      assert.deepEqual(shoulderEyeletTriangles(target.geometry,positions),authored,'High Collar preserves the authored front, crest, and rear eyelets');
     }
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
    if(tuckRefit||cupRefit||sweetheartOver){
     const before=source.geometry.getAttribute('position'),after=target.geometry.getAttribute('position');
     assert.equal(after.count,before.count);
     const tuckTop=n===2?1.238:1.217,clearance=n===2?.011001:.007001;
     for(let i=0;i<after.count;i++){
      const x=before.getX(i),y=before.getY(i),z=before.getZ(i),side=Math.abs(x);
      const rise=after.getY(i)-y;
      if(tuckRefit&&y<tuckTop){
       assert.equal(rise,0,'the tucked fit preserves the authored waist height');
       assert(Math.hypot(after.getX(i)-x,after.getZ(i)-z)<=clearance,'tucked waist refit is bounded');
       continue;
      }
      const overCup=sweetheartOver&&cupRefit&&side>.038&&side<.132&&y>1.259&&z>.036;
      const underarm=sweetheartOver&&cupRefit&&x>-.144&&x<-.084&&y>1.255&&z>.018;
      const innerCup=sweetheartOver&&side>.010&&side<.060&&y>1.243&&z>.074;
      const innerEase=n===2&&(cupRefit||sweetheartOver)&&x>-.068&&x<-.012&&y>1.247&&z>.072;
      const crest=cupRefit&&!sweetheartOver&&side>.039&&side<.108&&y>1.279&&z>.049;
      const rightCup=cupRefit&&x>-.132&&x<-.023&&z>.025&&y>1.266;
      const height=(overCup?.009001:0)+(underarm?.005001:0)+(innerCup&&cupRefit?.004001:0)+(crest?.002501:0);
      const depth=(rightCup?.045:0)+(overCup?.002001:0)+(underarm?.009001:0)+(innerCup?.006001:0)+(innerEase?.002501:0)+(crest?.009001:0);
      const width=(after.getX(i)-x)*Math.sign(x);
      assert(width>=(innerCup&&cupRefit?-.002001:0)&&width<=(underarm?.007001:0),'Sweetheart width changes stay local to the cup edges');
      if(x===0)assert.equal(after.getX(i),0,'the refit preserves the centerline');
      assert(rise>=0&&rise<=height,'the refit preserves other cup and hem heights');
      assert(after.getZ(i)>=z&&after.getZ(i)-z<=depth,'only the fitted cup regions move outward');
      if(overCup) sweetheartOverRise=Math.max(sweetheartOverRise,rise);
     }
    }
   });
  }
  if(n===2)assert(sweetheartOverRise>.006,'Sweetheart over-skirt cup has a visible coverage increase');
  if(n===5){
   assert(collarRemovedIndices>0,'High Collar removes the old shoulder fragments');
   const seams=model.root.getObjectByName('CLOTH_CORSET_HIGH_COLLAR_CAP_SEAMS');
   assert(seams?.isSkinnedMesh&&seams.geometry.index.count>0,'High Collar has body-rigged shoulder insets');
   assert.equal(seams.material.userData.color_slot,'accent');
   assert.equal(seams.material.normalMap,null,'High Collar insets use an untextured dye material');
   assert(seams.material.vertexColors && seams.geometry.attributes.color.array.every(channel=>channel>0&&channel<.5),
    'High Collar shoulder insets keep a subdued version of the accent dye');
   const seamPosition=seams.geometry.attributes.position;
   for(const side of [-1,1]){
    let front=Infinity,rear=Infinity,crest=-Infinity;
    for(const vertex of seams.geometry.index.array){
     if(side*seamPosition.getX(vertex)<=0)continue;
     const y=seamPosition.getY(vertex),z=seamPosition.getZ(vertex);
     if(z>.025)front=Math.min(front,y);
     if(z<-.040)rear=Math.min(rear,y);
     crest=Math.max(crest,y);
    }
    assert(front>1.33&&front<1.348&&rear<1.312&&crest>1.415,
     'each High Collar inset finishes at the front shoulder and reaches the back lacing');
   }
   const waistbandName='CLOTH_GOTHIC_SKIRT_05_GEO_1',pleatsName='CLOTH_GOTHIC_SKIRT_05_GEO_2';
   const waistband=model.root.getObjectByName(waistbandName).geometry;
   const authoredWaistband=scene.getObjectByName(waistbandName).geometry;
   const authoredIndex=authoredWaistband.index.array;
   const expected=[];
   for(let i=0;i<authoredIndex.length;i+=3){
    const triangle=authoredIndex.subarray(i,i+3);
    if(triangle.every(vertex=>authoredWaistband.attributes.position.getY(vertex)>1))expected.push(...triangle);
   }
   assert(expected.length>0&&expected.length<authoredIndex.length,'High Collar has a distinct short skirt shell');
   assert.deepEqual(Array.from(waistband.index.array),expected,'High Collar removes the short shell and keeps the laced waistband');
   assert.deepEqual(model.root.getObjectByName(pleatsName).geometry.index.array,
    scene.getObjectByName(pleatsName).geometry.index.array,'High Collar keeps the complete long pleated skirt');
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
   applyVillagerLook(model,assetLook(pinkAccent));
   model.root.getObjectByName('CLOTH_BOTTOM_SKIRT').traverse(part=>{
    if(part.isMesh)assert.equal(part.material.color.getHexString(),'335577','pink trim cannot color the Sweetheart waist seam');
   });
  }
  const tuckedChoice={set,shirt:'none',waist:'tucked'};
  const dyeChoice=n===4?{...DEFAULT_CHARACTER,wardrobeTrial:tuckedChoice}:{...DEFAULT_CHARACTER,wardrobe:tuckedChoice};
  const dyed=withClothingColors(dyeChoice,'corset',{color:'#ff0066',accent:'#ff0066'});
  applyVillagerLook(model,assetLook(dyed));
  let dyedMeshes=0;model.root.traverse(o=>{if(o.isMesh&&o.userData.clothingPiece==='corset'){for(const m of(Array.isArray(o.material)?o.material:[o.material]))assert.equal(m.color.getHexString(),'ff0066');dyedMeshes++;}});assert(dyedMeshes>2,'multi-material corsets all receive the piece dye');
  for(const node of doc.getRoot().listNodes().filter(n=>String(n.getExtras().wardrobeRole).startsWith('corset')&&n.getExtras().fit_version===5))for(const p of node.getMesh().listPrimitives()){
   const joints=p.getAttribute('JOINTS_0').getArray(),weights=p.getAttribute('WEIGHTS_0').getArray();
   for(let i=0;i<joints.length;i++)if(weights[i]>1e-5)assert(joints[i]<=5,'v5 corset straps never follow arm or twist joints');
  }

  for(const waist of ['tucked','over']){
   const fitChoice={set,shirt:'none',waist};
   const look=n===4?assetLook({...DEFAULT_CHARACTER,appearance,wardrobeTrial:fitChoice})
    :assetLook({...DEFAULT_CHARACTER,appearance,wardrobe:fitChoice});
   applyVillagerLook(model,look);
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
