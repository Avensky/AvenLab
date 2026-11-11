import {mkdir,writeFile,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions';
import {dedup,prune,reorder,simplifyPrimitive,textureCompress} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
const [source,destination]=process.argv.slice(2);
if(!source||!destination)throw Error('Usage: build-wardrobe-lods.mjs raw-directory output-directory');
await mkdir(destination,{recursive:true});
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const results=[];
for(let n=1;n<=5;n++)for(const lod of ['garage','mobile']){
 const id=`gothic-${String(n).padStart(2,'0')}`;
 const authoredMobile=lod==='mobile'&&await stat(join(source,id+'.mobile.glb')).then(()=>true,()=>false);
 const doc=await io.read(join(source,id+(authoredMobile?'.mobile':'')+'.glb'));
 // Body masks and the face's bind-space expressions must retain their coordinates.
 // Mobile simplification leaves the body/mask topology and face geometry intact.
 if(lod==='mobile'&&!authoredMobile)for(const mesh of doc.getRoot().listMeshes()){
  if(mesh.listPrimitives().some(p=>p.getAttribute('_AVEN_COVERAGE'))||/HEAD_FACE/.test(mesh.getName()))continue;
  for(const prim of mesh.listPrimitives())simplifyPrimitive(prim,{simplifier:MeshoptSimplifier,ratio:.48,error:.0015,lockBorder:true});
 }
 await doc.transform(dedup(),prune({keepLeaves:true}),textureCompress({encoder:sharp,resize:lod==='mobile'?[512,512]:[1024,1024],targetFormat:'webp',quality:88}),reorder({encoder:MeshoptEncoder,target:'performance'}));
 // Lossless meshopt stream coding. Position quantization would break the existing
 // bind-space eye/face shader, so don't change coordinates or coverage flags.
 doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
 const file=resolve(destination,`${id}.${lod}.glb`);await io.write(file,doc);
 const triangles=doc.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((s,p)=>s+(p.getIndices()?.getCount()??0)/3,0),0);
 results.push({id,lod,bytes:(await stat(file)).size,storedTriangles:triangles});console.log(results.at(-1));
}
await writeFile(join(destination,'asset-build.json'),JSON.stringify(results,null,2)+'\n');
