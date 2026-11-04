import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fleetDetail} from '../src/vehicles/fleetDetail.ts';

test('close combat detail follows each visible car on desktop, phone and through scope',()=>{
 const candidate=(distance,pixels,center=.6,visible=true)=>({distance,pixels,center,visible});
 for(const distance of [2,3,6,7,12])assert.equal(fleetDetail(candidate(distance,38),undefined,false,false),'near');
 assert.equal(fleetDetail(candidate(7,32),undefined,true,false),'near');
 assert.equal(fleetDetail(candidate(16,38),'near',false,false),'near');
 assert.equal(fleetDetail(candidate(30,55,.06),undefined,false,true),'near');
 assert.equal(fleetDetail(candidate(45,32),undefined,false,false),'medium');
 assert.equal(fleetDetail(candidate(90,13),undefined,false,false),'far');
 assert.equal(fleetDetail(candidate(5,200,0,false),'near',false,false),null);
});
test('all exteriors have three distinct detail levels, articulated tank mounts and an immediately usable seed',()=>{
 const seeds=JSON.parse(fs.readFileSync(new URL('../src/vehicles/fleetSeeds.json',import.meta.url)));
 for(const model of ['tank','ae86','brz','camaro','supra','cx30','mini','sierra','landcruiser','fortuner']){
  let previous=Infinity;
  const seed=seeds[model];assert(seed.length>=2);
  for(const part of seed){const bytes=Buffer.from(part.data,'base64');
   assert(part.vertices>0 && bytes.length>part.vertices*12);
   assert.equal((bytes.length-part.vertices*12)%6,0);
   for(let i=part.vertices*12;i<bytes.length;i+=2)assert(bytes.readUInt16LE(i)<part.vertices);
  }
  for(const tier of ['near','medium','far']){
   const bytes=fs.readFileSync(new URL(`../public/models/vehicles/lod/${model}-${tier}.glb`,import.meta.url));
   assert.equal(bytes.toString('ascii',0,4),'glTF');
   const d=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
   const triangles=d.meshes.flatMap(m=>m.primitives).reduce((sum,p)=>sum+d.accessors[p.indices].count/3,0);
   assert(d.meshes.length<=3 && triangles>0 && !d.images);
   assert(triangles<previous && triangles<({near:200000,medium:65000,far:20000})[tier]);previous=triangles;
   if(model==='tank')assert.deepEqual(d.nodes.map(n=>n.name).sort(),['cannon','trim','turret']);
  }
 }
});
