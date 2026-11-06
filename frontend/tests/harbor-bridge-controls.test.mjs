import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {harborCanal} from '../src/worldBuilder/generation/harborCanal.ts';
import {kitAsset} from '../src/worldBuilder/mapKit/catalog.ts';
import {worldSocket} from '../src/worldBuilder/mapKit/sockets.ts';
import {bridgeAngle} from '../src/world/props/bridgeMotion.ts';
import {streetProp} from '../src/worldBuilder/props/streetPropCatalog.ts';
test('viaduct mouths share height and width, with ground access from both banks',()=>{
  const objects=harborCanal('fleet',417).authored_layout.objects;
  const mouth=(id,which)=>{const o=objects.find(o=>o.id===id),a=kitAsset(o.piece);return worldSocket(o,a,a.sockets[which]);};
  for(const [before,after,input] of [['curve','span',0],['span','descent',1]]) {
    const a=mouth('viaduct-'+before,1),b=mouth('viaduct-'+after,input);
    assert(Math.hypot(...a.position.map((v,i)=>v-b.position[i]))<.001);
    assert(Math.abs(a.width-b.width)<.001);
    assert(Math.abs(a.position[1]-10.09)<.01);
  }
  assert(Math.abs(mouth('viaduct-descent',0).position[1]-.09)<.001);
  assert(objects.filter(o=>o.piece==='bridge-lever').length===2);
  assert(objects.filter(o=>o.piece==='downtown-metal-barrier' && o.destruction.enabled).length===14);
});
test('drawbridge holds a selected position and reverses continuously',()=>{
  const raised=70*Math.PI/180;
  const up={start_angle:0,start_tick:60,target_angle:raised,broken:null};
  assert.equal(bridgeAngle(1000,up),raised);
  const half=bridgeAngle(135,up);
  const down={start_angle:half,start_tick:135,target_angle:0,broken:null};
  assert.equal(bridgeAngle(135,down),half);assert.equal(bridgeAngle(1000,down),0);
});
test('food carts, storefront furniture, alley bags and signs load from the small shared GLB',()=>{
  const bytes=fs.readFileSync(new URL('../public/models/world/harbor-street-props.glb',import.meta.url));
  assert(bytes.length<1024*1024);const g=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  for(const s of ['cart','chair','table','bags','news','bin','closed','lane','lamp']){
    const p=streetProp('harbor-'+s);
    assert(g.nodes.some(n=>n.name===p.node && n.mesh!==undefined),s);
  }
});
