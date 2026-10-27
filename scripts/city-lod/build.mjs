// Run npm install in this directory, then node build.mjs. Original GLBs are unchanged.
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {simplifyPrimitive,weld,draco} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import draco3d from 'draco3dgltf';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule(),'draco3d.encoder':await draco3d.createEncoderModule()});
const path=fileURLToPath(new URL('../../frontend/public/models/chuncks/',import.meta.url));
const document=await io.read(path+'chunck_0,0_2x2_blocks_centered_textures512.glb');
const count=()=>document.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>a+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);
const original=count();const nodes=document.getRoot().listNodes().map(n=>({name:n.getName(),matrix:n.getWorldMatrix()}));const names=nodes.map(n=>n.name);
const placeholder=document.createMaterial('Runtime city material');for(const mesh of document.getRoot().listMeshes())for(const p of mesh.listPrimitives())p.setMaterial(placeholder);
for(const m of document.getRoot().listMaterials())if(m!==placeholder)m.dispose();for(const t of document.getRoot().listTextures())t.dispose();
await document.transform(weld({}));await MeshoptSimplifier.ready;
for(const mesh of document.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
 const normal=p.getAttribute('NORMAL'),uv=p.getAttribute('TEXCOORD_0');const attrs=new Float32Array(p.getAttribute('POSITION').getCount()*5);
 for(let i=0;i<p.getAttribute('POSITION').getCount();i++){const n=normal?.getElement(i,[])??[0,0,0],t=uv?.getElement(i,[])??[0,0];attrs.set([...n,...t],i*5);}
 const simplifier={simplify:(indices,positions,stride,target,error)=>MeshoptSimplifier.simplifyWithAttributes(indices,positions,stride,attrs,5,[.1,.1,.1,.2,.2],null,target,error,['Permissive'])};
 simplifyPrimitive(p,{simplifier,ratio:.15,error:.005});
}
await document.transform(draco({method:'edgebreaker'}));
await io.write(path+'chunck_0,0_2x2_blocks_centered_reduced.glb',document);
console.log(JSON.stringify({original,reduced:count(),ratio:count()/original,nodesBefore:names.length,nodesAfter:document.getRoot().listNodes().length,allNamesPreserved:names.every(n=>document.getRoot().listNodes().some(x=>x.getName()===n))}));

const after=document.getRoot().listNodes();
for(const before of nodes){const node=after.find(n=>n.getName()===before.name);if(!node||node.getWorldMatrix().some((v,i)=>Math.abs(v-before.matrix[i])>1e-6))throw new Error('Authored transform changed: '+before.name);}
const reduced=count();if(reduced>=original*.5)throw new Error('Reduced model did not meet the triangle budget');
const source=await readFile(path+'chunck_0,0_2x2_blocks_centered_textures512.glb');
await writeFile(path+'city-reduced-manifest.json',JSON.stringify({source:'chunck_0,0_2x2_blocks_centered_textures512.glb',sourceSHA256:createHash('sha256').update(source).digest('hex'),originalTriangles:original,reducedTriangles:reduced,reducedRatio:reduced/original,meshCount:document.getRoot().listMeshes().length,nodeCount:after.length,textures:document.getRoot().listTextures().length,recipe:{targetRatio:.15,error:.005,normalWeights:[.1,.1,.1],uvWeights:[.2,.2],flags:['Permissive']},transformsVerified:true},null,2)+'\n');
