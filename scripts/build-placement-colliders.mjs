import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {Matrix4,Vector3} from '../frontend/node_modules/three/build/three.core.js';
import {garageRole} from '../frontend/src/worldBuilder/models/modelRoles.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),input=path.join(root,'frontend/public/models/world/garage_special.glb'),output=path.join(root,'avenlab-server/src/assets/models/placement-colliders.json'),bytes=fs.readFileSync(input),hash=createHash('sha256').update(bytes).digest('hex');
if(bytes.toString('ascii',0,4)!=='glTF')throw Error('Fetch garage_special.glb with Git LFS first');
if(process.argv.includes('--check')){
 const doc=JSON.parse(fs.readFileSync(output,'utf8'));if(doc.version!==1||doc.assets[0].lods[0].sha256!==hash)throw Error('Garage collision data is stale. Run node scripts/build-placement-colliders.mjs');console.log('Garage collider source hash verified');
}else{
 const require=createRequire(path.join(root,'scripts/city-lod/package.json'));let NodeIO,ALL_EXTENSIONS,draco;
 try{({NodeIO}=await import(pathToFileURL(require.resolve('@gltf-transform/core'))));({ALL_EXTENSIONS}=await import(pathToFileURL(require.resolve('@gltf-transform/extensions'))));draco=(await import(pathToFileURL(require.resolve('draco3dgltf')))).default;}catch{throw Error('Install the existing asset tools first: npm ci --prefix scripts/city-lod');}
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()}),doc=await io.read(input),raw=[],scale=.06;
 for(const node of doc.getRoot().listNodes()){if(!node.getMesh())continue;const matrix=new Matrix4().fromArray(node.getWorldMatrix());for(const primitive of node.getMesh().listPrimitives()){
  const a=primitive.getAttribute('POSITION').getArray(),positions=[];for(let i=0;i<a.length;i+=3)positions.push(new Vector3().fromArray(a,i).applyMatrix4(matrix).multiplyScalar(scale).toArray());
  raw.push({node:node.getName(),positions,indices:Array.from(primitive.getIndices().getArray())});
 }}
 const pad=raw.find(p=>p.node==='Plane_PISTE'),min=[0,1,2].map(k=>Math.min(...pad.positions.map(v=>v[k]))),max=[0,1,2].map(k=>Math.max(...pad.positions.map(v=>v[k]))),origin=[(min[0]+max[0])/2,max[1],(min[2]+max[2])/2];
 const groups=new Map(),structuralPoints=[];
 for(const part of raw)for(let i=0;i<part.indices.length;i+=3){const vs=part.indices.slice(i,i+3).map(k=>part.positions[k]),normal=new Vector3(...vs[1]).sub(new Vector3(...vs[0])).cross(new Vector3(...vs[2]).sub(new Vector3(...vs[0])));if(normal.lengthSq()<1e-16)continue;normal.normalize();const role=garageRole(part.node,vs.reduce((n,v)=>n+v[1],0)/3,normal.y);if(!['floor','walls','roof'].includes(role))continue;
  const group=groups.get(role)??{role,vertices:[],indices:[],keys:new Map()},tri=[];for(const v of vs){const point=v.map((n,k)=>n-origin[k]),key=point.join(',');if(!group.keys.has(key)){group.keys.set(key,group.vertices.length);group.vertices.push(point);structuralPoints.push(point);}tri.push(group.keys.get(key));}group.indices.push(tri);groups.set(role,group);
 }
 const bounds={min:[0,1,2].map(k=>Math.min(...structuralPoints.map(v=>v[k]))),max:[0,1,2].map(k=>Math.max(...structuralPoints.map(v=>v[k])))},size=bounds.min.map((v,k)=>bounds.max[k]-v),colliders=[...groups.values()].map(({role,vertices,indices})=>({role,vertices,indices}));
 const result={format:'avenlab-placement-catalog',version:1,assets:[{id:'selection_garage',label:'Selection-screen garage',lods:[{lod:0,url:'/models/world/garage_special.glb?v=complete-1',sha256:hash}],source_scale:scale,origin,size,bounds,colliders}]};
 fs.writeFileSync(output,JSON.stringify(result)+'\n');console.log(`Garage: ${colliders.reduce((n,g)=>n+g.indices.length,0)} measured structural triangles; ${size.map(n=>n.toFixed(3)).join(' × ')} m. Decorative tiles, tubes and lights excluded from physics.`);
}
