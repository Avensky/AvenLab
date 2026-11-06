import test from 'node:test';
import assert from 'node:assert/strict';
import {savedWorldPortrait} from '../src/game/preview/worldPortraitSource.ts';
import {worldPreviewShapes} from '../src/game/preview/worldPreviewGeometry.ts';
test('next selection sees newly saved carrier and never reuses a map-ID cache',()=>{
 let objects=[];const storage={getItem:key=>key.startsWith('avenlab-layout-v1:')?JSON.stringify({map_id:'harbor',objects}):null};
 assert.equal(worldPreviewShapes(savedWorldPortrait('harbor',storage)).length,0);
 objects=[{piece:'carrier',position:[0,0,0],size:[40,30,300],yaw:90,color:'#abcdef'}];
 assert.equal(worldPreviewShapes(savedWorldPortrait('harbor',storage))[0].d,300);
 assert.equal(savedWorldPortrait('other',storage),null);
});
test('corrupt and inaccessible drafts fall back to installed map',()=>{assert.equal(savedWorldPortrait('a',{getItem:()=>'{'}),null);assert.equal(savedWorldPortrait('a',{getItem:()=>{throw Error();}}),null);});
