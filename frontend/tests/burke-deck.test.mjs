import {vehicleModelUrl,vehicleLodUrl} from '../src/vehicles/assetCatalog.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {burkeCollisionParts,burkeHarborKeel,burkeKeelY,burkeSize} from '../src/worldBuilder/generation/burkeDeck.ts';
import {CARRIER,DESTROYER,deckPanorama,harborPieces} from '../src/worldBuilder/generation/harborPieces.ts';
import {harborCanal} from '../src/worldBuilder/generation/harborCanal.ts';
import {partTransform,pieceById} from '../src/worldBuilder/document/layoutDocument.ts';

const shapeTop=(object,part)=>object.position[1]+(part.position[1]+part.size[1]/2)*object.size[1];

test('Burke binaries are self-contained GLB 2.0 with lower triangle-count distance tier',()=>{
  const triangles=[];
  for(const lod of [0,1]){
    const blob=fs.readFileSync(new URL('../public'+(lod===0?vehicleModelUrl('burke'):vehicleLodUrl('burke','medium')),import.meta.url));
    assert.equal(blob.subarray(0,4).toString(),'glTF');
    assert.equal(blob.readUInt32LE(4),2);
    assert.equal(blob.readUInt32LE(8),blob.length);
    const model=JSON.parse(blob.subarray(20,20+blob.readUInt32LE(12)));
    assert.equal(model.buffers.length,1);
    assert(!model.buffers[0].uri,'no external buffer dependency');
    assert((model.images??[]).every(image=>!image.uri),'no missing external textures');
    triangles.push(model.meshes.reduce((sum,mesh)=>sum+mesh.primitives.reduce((s,p)=>s+model.accessors[p.indices].count/3,0),0));
  }
  assert.equal(triangles[0],80609);
  assert(triangles[1]<triangles[0]*.65);
});

test('measured hull and deck collision fits the authoring bounds, with a usable stern pad',()=>{
  assert.deepEqual(pieceById(DESTROYER)?.size,burkeSize);
  assert.equal(burkeCollisionParts.length,10);
  const item={id:'dock',piece:DESTROYER,name:'Burke',size:burkeSize,position:[326,burkeHarborKeel,0],yaw:0,
    color:'#52626b',locked:false,solid:true,parts:burkeCollisionParts};
  for(const part of burkeCollisionParts){
    assert(part.size.every(size=>size>0&&size<=4));
    assert(part.position.every(position=>Math.abs(position)<=2));
    const resolved=partTransform(item,part);
    assert(resolved.size.every(size=>size>0));
  }
  const landing=burkeCollisionParts[8];
  assert(Math.abs(shapeTop(item,landing)-(burkeHarborKeel-2.85-burkeKeelY))<.01);
  assert(Math.abs(burkeHarborKeel+(-7-burkeKeelY)-(-8))<1);
  const {eye}=deckPanorama(item,[]);
  assert(eye[1]>shapeTop(item,landing)+3);
  assert(eye[2]>40,'camera is near the aft helipad');
});

test('active harbor teams berth each escort inside the navigable canal with shore access',()=>{
  for(const plan of ['red','blue','fleet']){
    const layout=harborCanal(plan,41).authored_layout;
    const escorts=layout.objects.filter(item=>item.piece===DESTROYER);
    assert.equal(escorts.length,plan==='fleet'?2:1);
    for(const ship of escorts){
      assert.equal(ship.position[1],burkeHarborKeel);
      assert.equal(ship.parts.length,burkeCollisionParts.length);
      const carrier=layout.objects.find(item=>item.id==='carrier-'+ship.id.split('-')[1]);
      assert(carrier);
      const side=ship.id.includes('red')?-1:1;
      assert.equal(ship.position[0],0,'escort is on the centerline of the canal');
      assert.equal(ship.position[2],side*97);
      assert(Math.abs(ship.position[0]-carrier.position[0])>100);
      assert(layout.objects.some(item=>item.name==='Canal-to-destroyer boarding gangway' &&
        Math.sign(item.position[0])===side && item.parts[0].shape==='deck'));
      assert(layout.objects.filter(item=>item.id.startsWith(`canal-boarding-${ship.id.split('-')[1]}`)).length>=10);
    }
  }
  assert(harborPieces.some(piece=>piece.id===CARRIER));
});
