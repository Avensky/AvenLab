import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {readGlb,generateRoadCatalog} from '../../scripts/build-road-colliders.mjs';
import {ROAD_ASSETS,newRoad,roadBounds,roleAt,roleVisible,roleSolid} from '../src/worldBuilder/roads/roadCatalog.ts';
import {addPiece,emptyLayout,footprint,parseLayout,layoutJSON,parseLayoutText,updatePiece} from '../src/worldBuilder/layoutDocument.ts';
import {localBounds,snapLayoutPosition} from '../src/worldBuilder/roads/layoutSnapping.ts';
import {opposingRoadPair} from '../src/worldBuilder/roads/roadPair.ts';
import {mapExport} from '../src/worldBuilder/mapDocument.ts';

test('catalog reproduces measured GLB triangles, source hashes and complete corner groups',()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../../avenlab-server/src/assets/roads/road-colliders.json',import.meta.url),'utf8'));
 assert.deepEqual(generateRoadCatalog(),catalog);
 for(const asset of ROAD_ASSETS){
  const file=new URL('../public'+asset.lods[0].url,import.meta.url),{bytes,raw}=readGlb(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.lods[0].sha256);
  const classified=new Map();
  for(const part of raw){for(let i=0;i<part.indices.length;i+=3){
   const vs=part.indices.slice(i,i+3).map(index=>{const [x,y,z]=part.positions.slice(index*3,index*3+3).map((n,k)=>n-asset.origin[k]);return asset.id==='road_wide'?[z,y,-x]:[x,y,z];});
   const role=roleAt(part.material,vs.reduce((n,v)=>n+v[0],0)/3,vs.reduce((n,v)=>n+v[2],0)/3,asset.id);
   if(role==='markings'||role==='details')continue;
   const [a,b,c]=vs,u=b.map((n,k)=>n-a[k]),v=c.map((n,k)=>n-a[k]);
   if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<=1e-8)continue;
   classified.set(role,(classified.get(role)??0)+1);
  }}
  assert.deepEqual(Object.fromEntries(classified),Object.fromEntries(asset.colliders.map(c=>[c.role,c.indices.length])));
  assert.ok(asset.colliders.every(c=>!['markings','details'].includes(c.role)));
 }
 assert.equal(ROAD_ASSETS.find(a=>a.id==='intersection').colliders.length,9);
});

test('visibility, decorative surfaces and render LOD are independent and imports are revision checked',()=>{
 const doc=addPiece(emptyLayout('test'),'glb-road_narrow',[0,0,0]),item=doc.objects[0],r=item.road;
 assert.equal(doc.ground,false);assert.equal(doc.repeat,false);assert.deepEqual(parseLayoutText(layoutJSON(doc)),doc);
 assert.equal(roleSolid('left-curb',r),true);r.variant.left=false;
 assert.equal(roleVisible('left-paving',r.variant),false);assert.equal(roleSolid('left-curb',r),false);
 r.variant.left=true;r.collision.curbs=false;assert.equal(roleVisible('left-curb',r.variant),true);assert.equal(roleSolid('left-curb',r),false);
 const before=roadBounds(r);r.lod=2;assert.deepEqual(roadBounds(r),before);
 assert.equal(roleSolid('markings',r),false);assert.equal(roleSolid('details',r),false);
 const invalid=structuredClone(doc);invalid.objects[0].road.source_sha256='stale';assert.throws(()=>parseLayout(invalid),/revision/);
 const mixed=structuredClone(doc);mixed.objects[0].parts=[{shape:'box',position:[0,.5,0],size:[1,1,1]}];assert.throws(()=>parseLayout(mixed));
 const bad=structuredClone(doc);bad.objects[0].road.collision.paving='false';assert.throws(()=>parseLayout(bad));
 const budget=addPiece(emptyLayout('test'),'glb-intersection',[0,0,0]);budget.objects=Array.from({length:456},(_,i)=>({...budget.objects[0],id:`junction-${i}`}));assert.throws(()=>parseLayout(budget),/4096/);
});

test('opposing carriageways align the asphalt and remove only adjacent local sidewalks',()=>{
 let doc=addPiece(emptyLayout('test'),'glb-road_narrow',[10,2,20],90);doc=opposingRoadPair(doc,doc.objects[0].id);
 const [a,b]=doc.objects,bounds=localBounds(a,'asphalt'),width=bounds.max[0]-bounds.min[0];
 assert.ok(Math.abs(b.position[0]-10)<1e-8);assert.ok(Math.abs(b.position[2]-(20-width))<1e-8);assert.equal(b.yaw,-90);
 for(const item of doc.objects){assert.equal(item.road.variant.left,true);assert.equal(item.road.variant.right,false);}
 const snapped=snapLayoutPosition(b,[b.position[0]+.4,2,b.position[2]+.2],[a],'asphalt',1);
 assert.ok(snapped.lock);assert.ok(Math.abs(snapped.position[0]-b.position[0])<1e-8);assert.ok(Math.abs(snapped.position[2]-b.position[2])<1e-8);
 const noLevel=snapLayoutPosition(b,[b.position[0],20,b.position[2]],[a],'asphalt',1);assert.equal(noLevel.lock,null);
 const old=footprint(a);a.road.variant.left=false;assert.notDeepEqual(footprint(a),old);
});

test('finite road exports preserve empty space, create one district and put spawns on a road',()=>{
 const source=JSON.parse(fs.readFileSync(new URL('../../avenlab-server/src/assets/blocks/streaming_endless_city_colliders.json',import.meta.url),'utf8'));
 const layout=addPiece(emptyLayout(source.map_id),'glb-road_narrow',[10,4,20],90),map=JSON.parse(mapExport({...source,authored_layout:layout}));
 assert.deepEqual(map.layout,{kind:'fixed_grid',origin:[0,0],size:[1,1]});assert.equal(map.authored_layout.ground,false);assert.equal(map.surface.road_y,4);
 assert.deepEqual(map.team_spawns.red[0].chunk,[0,0]);assert.ok(map.cell[0]>240);assert.equal(map.authored_layout.objects[0].parts.length,0);
 const moved=updatePiece(layout,layout.objects[0].id,{size:[110, .4, 480]});assert.ok(localBounds(moved.objects[0]).max[2]>200);
});
