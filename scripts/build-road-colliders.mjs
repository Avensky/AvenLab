// Reproducible LOD0 extraction. No Blender dependency; no guessed boxes.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Matrix4, Quaternion, Vector3} from '../frontend/node_modules/three/build/three.core.js';
import {prepareRoadTemplate, defaultVariant, collisionParts, boundsOf, dimensions} from '../frontend/src/worldBuilder/roadKit/roadKitCore.ts';
import {splitSidewalks} from '../frontend/src/worldBuilder/roads/roadGeometry.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const families = [['road_narrow','Road_Narrow_Oneway','Narrow one-way road'],['road_wide','Road_Wide_Twoway','Wide two-way road'],['intersection','Road_Intersection','Road intersection']];
export function readGlb(file) {
  const bytes=fs.readFileSync(file);
  if(bytes.toString('ascii',0,4)!=='glTF')throw Error(`${file}: fetch Git LFS assets first`);
  const n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n).toString()),bin=bytes.subarray(28+n);
  if(doc.extensionsRequired?.includes('KHR_draco_mesh_compression'))throw Error('Use the uncompressed road LOD exports');
  const accessor=i=>{const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],component={5121:1,5123:2,5125:4,5126:4}[a.componentType];
    if(!size||!component||a.sparse||a.normalized)throw Error('Unsupported road accessor');
    const methods={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'},out=[];
    for(let j=0;j<a.count;j++)for(let k=0;k<size;k++)out.push(bin[methods[a.componentType]]((v.byteOffset??0)+(a.byteOffset??0)+j*(v.byteStride??size*component)+k*component));return out;};
  const raw=[];
  const visit=(i,parent)=>{const node=doc.nodes[i],local=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3().fromArray(node.translation??[0,0,0]),new Quaternion().fromArray(node.rotation??[0,0,0,1]),new Vector3().fromArray(node.scale??[1,1,1])),world=new Matrix4().multiplyMatrices(parent,local);
    if(node.mesh!==undefined)doc.meshes[node.mesh].primitives.forEach((p,j)=>{if((p.mode??4)!==4)throw Error('Road must use triangles');const positions=accessor(p.attributes.POSITION),v=new Vector3();for(let k=0;k<positions.length;k+=3){v.fromArray(positions,k).applyMatrix4(world).toArray(positions,k);}let indices=p.indices===undefined?Array.from({length:positions.length/3},(_,k)=>k):accessor(p.indices);if(world.determinant()<0){indices=[...indices];for(let k=0;k<indices.length;k+=3)[indices[k+1],indices[k+2]]=[indices[k+2],indices[k+1]];}
      raw.push({id:`${i}-${j}`,sourceNode:node.name??`node-${i}`,material:doc.materials[p.material]?.name??'',positions,indices});});
    for(const child of node.children??[])visit(child,world);};
  for(const i of doc.scenes[doc.scene??0].nodes)visit(i,new Matrix4());
  return {bytes,raw};
}
function compact(parts) {
  const groups=new Map();
  for(const part of parts){const g=groups.get(part.role)??{role:part.role,vertices:[],indices:[],keys:new Map()};
    for(let i=0;i<part.indices.length;i+=3){const tri=[];for(const index of part.indices.slice(i,i+3)){const v=part.positions.slice(index*3,index*3+3),key=v.join(',');if(!g.keys.has(key)){g.keys.set(key,g.vertices.length);g.vertices.push(v);}tri.push(g.keys.get(key));}
      const [a,b,c]=tri.map(n=>new Vector3(...g.vertices[n])),area=new Vector3().subVectors(b,a).cross(new Vector3().subVectors(c,a)).lengthSq();if(area>1e-16)g.indices.push(tri);}
    groups.set(part.role,g);}
  return [...groups.values()].map(({role,vertices,indices})=>({role,vertices,indices}));
}
export function generateRoadCatalog() {
  const assets=families.map(([id,name,label])=>{
    const folder=path.join(root,'frontend/public/models/roads',name),lods=[0,1,2].map(lod=>{const file=`${name}_LOD${lod}.glb`,bytes=fs.readFileSync(path.join(folder,file));return {lod,url:`/models/roads/${name}/${file}`,sha256:createHash('sha256').update(bytes).digest('hex')};});
    const {raw}=readGlb(path.join(folder,`${name}_LOD0.glb`)),template=prepareRoadTemplate(id,raw.flatMap(splitSidewalks)),physical=collisionParts(template,defaultVariant()),bounds=boundsOf(physical),size=dimensions(bounds);size[1]=Math.max(.02,size[1]);
    const colliders=compact(physical),required=id==='intersection'?['nw','ne','sw','se']:['left','right'];for(const side of required)for(const kind of ['curb','paving'])if(!colliders.some(c=>c.role===`${side}-${kind}`))throw Error(`${id}: missing ${side}-${kind}`);
    console.log(`${id}: ${colliders.reduce((n,c)=>n+c.indices.length,0)} source triangles; ${colliders.length} collision groups; ${size.map(n=>n.toFixed(4)).join(' × ')} m`);
    return {id,label,lods,origin:template.origin,source_yaw:template.sourceYaw,size,bounds,surface:template.surface,colliders};
  });
  return {format:'avenlab-road-catalog',version:1,coordinates:{units:'meters',up_axis:'y',forward_axis:'-z'},collision_source:'LOD0: asphalt_01, Sidewalk_01 and Sidewalk_02. Paint and details are visual only.',assets};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const bytes=JSON.stringify(generateRoadCatalog())+'\n',out=path.join(root,'avenlab-server/src/assets/roads/road-colliders.json');
  if(process.argv.includes('--check')){if(fs.readFileSync(out,'utf8')!==bytes)throw Error('Road catalog is stale. Run node scripts/build-road-colliders.mjs');}
  else fs.writeFileSync(out,bytes);
}
