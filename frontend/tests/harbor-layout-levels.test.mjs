import assert from 'node:assert/strict';
import test from 'node:test';
import {harborCanal} from '../src/worldBuilder/generation/harborCanal.ts';
import {GUARDRAIL_MODULE_METERS} from '../src/worldBuilder/generation/harborPieces.ts';
import {LAYOUT_LEVELS,layoutLevel,MAX_CONSTRUCTION_FLOOR} from '../src/worldBuilder/document/layoutLevels.ts';
import {MAX_LAYOUT_OBJECTS} from '../src/worldBuilder/document/layoutDocument.ts';
import {kitAsset} from '../src/worldBuilder/mapKit/catalog.ts';
import {worldSocket} from '../src/worldBuilder/mapKit/sockets.ts';

test('construction planes provide sea, ground and three distinct upper floors',()=>{
  assert.deepEqual(LAYOUT_LEVELS.slice(0,5).map(x=>x.elevation),[-8,0,4,8,12]);
  assert.equal(layoutLevel('floor3').label,'FLOOR 3');
  assert.equal(layoutLevel('floor5').elevation,20);
  assert.equal(layoutLevel('floor128').elevation,512);
  assert.equal(LAYOUT_LEVELS.length,MAX_CONSTRUCTION_FLOOR+2);
});

test('64-metre harbor, independent car-length rails and both escorts clear the bridges',()=>{
  for(const name of ['red','blue','fleet']){
    const layout=harborCanal(name,417).authored_layout;
    const objects=layout.objects;
    assert(objects.length>1000&&objects.length<MAX_LAYOUT_OBJECTS);
    assert.equal(new Set(objects.map(x=>x.id)).size,objects.length,'unique collision identities');
    const rails=objects.filter(x=>x.piece==='highway-guardrail');
    assert(rails.length>700);
    assert(rails.every(x=>x.size[0]<=GUARDRAIL_MODULE_METERS+0.001 && x.destruction?.enabled));
    const west=objects.find(x=>x.piece==='kit-stone_start');
    const east=objects.find(x=>x.piece==='kit-stone_end');
    const jointA=worldSocket(west,kitAsset(west.piece),kitAsset(west.piece).sockets[1]);
    const jointB=worldSocket(east,kitAsset(east.piece),kitAsset(east.piece).sockets[0]);
    assert(Math.hypot(...jointA.position.map((n,i)=>n-jointB.position[i]))<0.01);
    for(const ship of objects.filter(x=>x.piece==='arleigh-burke-docked')){
      assert.equal(ship.position[0],0);
      assert(Math.abs(ship.position[2])+ship.size[2]/2<194-10);
      assert(Math.abs(ship.position[2])-ship.size[2]/2>10);
    }
    assert(objects.filter(x=>x.name==='Quayside avenue').every(x=>x.size[0]===20));
  }
});
