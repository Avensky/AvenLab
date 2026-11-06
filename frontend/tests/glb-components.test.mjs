import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {standardizeGlb,readChunks} from '../../scripts/lib/glb-components.mjs';
test('real vehicle migration preserves geometry, pivots, animation, skins, and authored names',()=>{
 const bytes=fs.readFileSync(new URL('../public/models/vehicles/charger70.glb',import.meta.url)),before=readChunks(bytes),doc=JSON.parse(before[0].data),result=standardizeGlb(bytes,'charger70'),after=readChunks(result.bytes),next=JSON.parse(after[0].data);
 for(let i=1;i<before.length;i++)assert.deepEqual(after[i],before[i]);
 for(const [i,node] of doc.nodes.entries())for(const key of Object.keys(node).filter(k=>k!=='extras'))assert.deepEqual(next.nodes[i][key],node[key]);
 assert.deepEqual(next.skins,doc.skins);assert.deepEqual(next.animations,doc.animations);
 assert(result.report.components.some(c=>c.role==='wheel.pivot.front_left'));
 assert.deepEqual(standardizeGlb(result.bytes,'charger70').bytes,result.bytes);
});
test('LFS pointers and truncated GLBs are rejected',()=>{assert.throws(()=>standardizeGlb(Buffer.from('version https://git-lfs.github.com/spec/v1'),'bad'));assert.throws(()=>standardizeGlb(Buffer.alloc(20),'bad'));});
