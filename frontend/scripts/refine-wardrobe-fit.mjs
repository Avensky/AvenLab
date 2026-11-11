/** Offline v4 -> v5 fitting pass. Uses the bare body's surface, never a dressed silhouette. */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { BufferGeometry, BufferAttribute, Vector3, Ray, DoubleSide } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
const [source, output] = process.argv.slice(2);
if (!source || !output || source === output) throw Error('Usage: refine-wardrobe-fit.mjs source-directory new-directory');
await mkdir(output, {recursive:true}); await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const smooth = (a,b,x) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t); };
for(let n=1;n<=5;n++)for(const lod of ['garage','mobile']){
 const file=`gothic-0${n}.${lod}.glb`,doc=await io.read(join(source,file)),root=doc.getRoot(),buffer=root.listBuffers()[0];
 const nodes=Object.fromEntries(root.listNodes().filter(n=>n.getExtras().wardrobeRole).map(n=>[n.getExtras().wardrobeRole,n]));
 if(nodes.bottom.getExtras().fit_version!==4)throw Error(`Expected original v4: ${file}`);
 const geometry=p=>{const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(new Float32Array(p.getAttribute('POSITION').getArray()),3));g.setIndex(new BufferAttribute(new Uint32Array(p.getIndices().getArray()),1));return g;};
 const surface=role=>nodes[role].getMesh().listPrimitives().filter(p=>p.getMaterial()?.getExtras().color_slot!=='hardware').map(p=>new MeshBVH(geometry(p)));
 const body=surface('body'),skirt=surface('bottom');
 const origin=new Vector3(),direction=new Vector3(),ray=new Ray(origin,direction);
 const radius=(trees,x,y,z)=>{origin.set(0,y,.025);direction.set(x,0,z-.025).normalize();let hits=trees.flatMap(bvh=>bvh.raycast(ray,DoubleSide)).map(h=>h.distance).filter(r=>r>.025&&r<.4);return hits.length?Math.max(...hits):null;};
 // Every touching torso layer uses the same smooth spine field. Arm/twist weights
 // must never pull shoulder straps sideways when the hands leave the rest pose.
 const levels=[.94,1.025,1.10,1.17,1.245,1.325];
 function spineWeights(p,i,y,blend=1){const js=p.getAttribute('JOINTS_0'),ws=p.getAttribute('WEIGHTS_0');let hi=levels.findIndex(h=>h>=y);if(hi<0)hi=5;let lo=Math.max(0,hi-1),t=hi===lo?0:smooth(levels[lo],levels[hi],y);const map=new Map();let a=[],b=[];js.getElement(i,a);ws.getElement(i,b);for(let k=0;k<4;k++)map.set(a[k],(map.get(a[k])??0)+b[k]*(1-blend));map.set(lo,(map.get(lo)??0)+(1-t)*blend);map.set(hi,(map.get(hi)??0)+t*blend);let out=[...map].sort((a,b)=>b[1]-a[1]).slice(0,4);while(out.length<4)out.push([0,0]);let sum=out.reduce((s,e)=>s+e[1],0);js.setElement(i,out.map(e=>e[0]));ws.setElement(i,out.map(e=>e[1]/sum));}
 for(const[role,node]of Object.entries(nodes)){
  if(!/^(corset|shirt|bottom|shorts)/.test(role))continue;
  node.setExtras({...node.getExtras(),fit_version:5,fit_description:'Torso-bound straps; shared waist weights; fitted inner and outer layers'});
  for(const p of node.getMesh().listPrimitives()){
   for(const semantic of ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0','_AVEN_COVERAGE']){const a=p.getAttribute(semantic);if(a)p.setAttribute(semantic,a.clone());}
   const pos=p.getAttribute('POSITION'),slot=p.getMaterial()?.getExtras().color_slot;let v=[];
   for(let i=0;i<pos.getCount();i++){
    pos.getElement(i,v);let[x,y,z]=v;const r=Math.hypot(x,z-.025),padding=slot==='hardware'?.007:slot==='accent'?.0055:.004;
    if(n===4&&role.startsWith('corset')&&y>1.29){
     const f=smooth(1.29,1.34,y);x*=1-.08*f;y-=Math.max(0,y-1.29)*.10;
     const target=radius(body,x,y,z);const rr=Math.hypot(x,z-.025);
     if(target&&rr>0){const scale=(target+padding+.008)/rr;x*=1-f+f*scale;z=.025+(z-.025)*(1-f+f*scale);}
    }
    if(role==='corset-tucked'||role==='shirt-over-tucked'||role==='shirt-under'){
     const outer=radius(skirt,x,y,z);if(outer&&y<1.19&&r>outer-.005){const f=1-smooth(1.15,1.19,y),scale=(outer-.006)/Math.hypot(x,z-.025);x*=1-f+f*scale;z=.025+(z-.025)*(1-f+f*scale);}
    }
    if(role==='shirt-under'){x*=.978;z=.025+(z-.025)*.978;}
    pos.setElement(i,[x,y,z]);
    const blend=role==='bottom'?smooth(.98,1.075,y):role==='shorts'?smooth(.93,.98,y):1;
    if(blend)spineWeights(p,i,y,blend);
   }
   const g=geometry(p);g.computeVertexNormals();p.setAttribute('NORMAL',doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes.normal.array)).setBuffer(buffer));g.dispose();
  }
 }
 // Conservative hidden-face coverage: mask only under a real outer surface.
 // Preserve neckline openings, shorts and bare-body coverage attributes.
 // Keep the inner shirt's continuous neckline. Triangle masks on this thin
 // layer produced saw-tooth edges in the back opening while clapping.
 const corsets=[surface('corset-tucked'),surface('corset-over')];
 for(const p of nodes['shirt-under'].getMesh().listPrimitives()){
  const pos=p.getAttribute('POSITION'),flags=p.getAttribute('_AVEN_COVERAGE');
  if(flags)flags.setArray(new Float32Array(pos.getCount()));
  let v=[];for(let i=0;i<pos.getCount();i++){
   pos.getElement(i,v);const[x,y,z]=v,r=Math.hypot(x,z-.025);
   const surfaces=corsets.map(trees=>radius(trees,x,y,z)).filter(v=>v!==null);
   if(surfaces.length){const inner=Math.min(...surfaces)-.005;if(r>inner&&inner>.03){const scale=inner/r;pos.setElement(i,[x*scale,y,.025+(z-.025)*scale]);}}
  }
  const g=geometry(p);g.computeVertexNormals();p.getAttribute('NORMAL').setArray(new Float32Array(g.attributes.normal.array));g.dispose();
 }
 const shirts={tucked:surface('shirt-over-tucked'),over:surface('shirt-over-over')};
 for(const waist of ['tucked','over'])for(const p of nodes[`corset-${waist}`].getMesh().listPrimitives()){
  const pos=p.getAttribute('POSITION'),flags=p.getAttribute('_AVEN_COVERAGE')??doc.createAccessor().setType('SCALAR').setArray(new Float32Array(pos.getCount())).setBuffer(buffer);p.setAttribute('_AVEN_COVERAGE',flags);
  let v=[];for(let i=0;i<pos.getCount();i++){pos.getElement(i,v);const[x,y,z]=v;const outer=radius(shirts[waist],x,y,z);if(outer&&y<1.30&&y>(waist==='tucked'?1.105:.985))flags.setScalar(i,flags.getScalar(i)|(waist==='tucked'?16:32));}
 }
 // Ensure the generated shirt participates in both global and individual dye controls.
 for(const m of root.listMaterials())if(/MAT_SHIRT/.test(m.getName()))m.setExtras({...m.getExtras(),color_slot:'fabric'}).setBaseColorFactor([.68,.61,.49,1]);
 doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
 await doc.transform(prune({keepLeaves:true}));
 await io.write(join(output,file),doc);console.log(file,'fitted v5');
}
