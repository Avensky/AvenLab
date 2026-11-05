import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import { harborCanal } from '../src/worldBuilder/generation/harborCanal.ts';

test('inclined boarding rails follow both ramp endpoints and home garages sit wholly on the bank',()=>{
  for (const plan of ['red','blue','fleet']) {
    const objects=harborCanal(plan,417).authored_layout.objects;
    for (const ramp of objects.filter(o=>o.name==='Quay to flight deck')) {
      const side=Math.sign(ramp.position[0]), bank=side<0?'west':'east';
      const shore=Math.abs(ramp.position[0])-ramp.size[2]/2;
      const rails=objects.filter(o=>o.id.startsWith('boarding-rail-'+bank));
      for(const rail of rails) {
        const span=rail.parts[0];
        for(const end of [-.5,.5]) {
          const x=Math.abs(rail.position[0])+end*rail.size[0];
          const grade=ramp.position[1]+ramp.size[1]*Math.min(1,(x-shore)/ramp.size[2]);
          const height=rail.position[1]+end*(span.rise??0)*rail.size[1];
          assert(Math.abs(height-grade)<1e-5);
        }
        for(const post of rail.parts.slice(1)) {
          const rise=span.rise??0;
          assert(Math.abs(post.position[1]-.4-post.position[0]*rise)<1e-5);
        }
      }
      const bay=objects.find(o=>o.id==='home-gas-'+bank);
      const apron=objects.find(o=>o.id==='home-apron-'+bank);
      for(const o of [bay,apron]) assert(Math.abs(o.position[0])+o.size[0]/2<shore-2);
      assert(bay.position[2]+bay.size[2]/2 < ramp.position[2]-ramp.size[0]/2);
    }
    const panes=objects.filter(o=>o.piece==='breakaway-glass');
    assert.equal(panes.length,2);
    for(const pane of panes) {
      const gallery=objects.find(o=>o.piece==='launch-gallery'&&o.position[0]===pane.position[0]);
      const target=objects.find(o=>o.name==='Cross-street landing roof'&&o.position[0]===pane.position[0]);
      assert(pane.destruction.enabled && pane.solid);
      assert.equal(gallery.position[2]-gallery.size[2]/2,pane.position[2]);
      assert.equal(target.position[2]-target.size[2]/2-(gallery.position[2]+gallery.size[2]/2),12);
      assert.equal(target.size[1],2.4);
    }
  }
});

test('stalk signals work with the headlight switch off and fog lamps extinguish on high',async()=>{
  const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  try {
    const {lampSignal,signals}=await vite.ssrLoadModule('/src/vehicles/tools/roadLamps.ts');
    const {VehicleFlags:f}=await vite.ssrLoadModule('/src/store/input/protocol/inputMasks.ts');
    for(const id of ['skyline34','charger70','interceptor','enforcer']) {
      assert.equal(signals[id].filter(s=>s.kind==='left').length,2);
      assert.equal(signals[id].filter(s=>s.kind==='right').length,2);
    }
    assert.equal(lampSignal('left',false,false,f.BLINKER_LEFT,true),'amber');
    assert.equal(lampSignal('right',false,false,f.BLINKER_LEFT,true),null);
    assert.equal(lampSignal('right',false,false,f.HAZARDS,true),'amber');
    assert.equal(lampSignal('left',false,false,f.HAZARDS,false),null);
    assert.equal(lampSignal('fog',true,false,0,false,true),null);
    assert.equal(lampSignal('head',true,false),'head');
  } finally {await vite.close();}
});

test('shipping rigs separate tire rubber, windshields and decorative masked badges',()=>{
  for(const id of ['skyline34','charger70','interceptor','enforcer']) {
    const b=fs.readFileSync(new URL('../public/models/vehicles/'+id+'.glb',import.meta.url));
    const {materials}=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
    const tires=materials.filter(m=>m.name.startsWith('TireRubber_'));
    if(id!=='charger70') assert(tires.length>0);
    for(const m of tires) {
      assert.equal(m.alphaMode,'OPAQUE');
      assert(Math.max(...m.pbrMetallicRoughness.baseColorFactor.slice(0,3))<.04);
    }
    if(id==='charger70') assert.equal(materials.find(m=>m.name==='GlassMtl').alphaMode,'BLEND');
    if(id==='skyline34') assert(!materials.some(m=>m.emissiveFactor?.some(Boolean)));
    if(id==='enforcer' || id==='interceptor') {
      const name=id==='enforcer'?'chassis':'Livery';
      assert.equal(materials.find(m=>m.name===name).alphaMode,'OPAQUE');
    }
  }
});
