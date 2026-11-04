import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {PerspectiveCamera,Vector3} from 'three';

test('packed controls, full-detail restore and bore-sight target',async t=>{
 const vite=await createServer({server:{middlewareMode:true,ws:false,hmr:false},appType:'custom',logLevel:'error'});
 const load=path=>vite.ssrLoadModule('/src/'+path);
 try{
  await t.test('browser writes exactly the vectors decoded by the Rust reader',async()=>{
   const {encodePackedInput}=await load('net/packedInput.ts');
   const fixtures=JSON.parse(await readFile(new URL('../../avenlab-server/tests/fixtures/packed-input-v1.json',import.meta.url),'utf8'));
   for(const {input,hex} of fixtures)assert.equal(Buffer.from(encodePackedInput(input)).toString('hex'),hex);
  });
  await t.test('low and benchmark both return to this driver’s saved values',async()=>{
   const {useRenderSettingsStore:display}=await load('store/presentation/renderSettingsStore.ts');
   const s=display.getState();
   s.update({dpr:1.5,cityViewDistance:750,cityQuality:'balanced',shadows:true,hud:true});
   s.cityPerformancePreset();s.cityPerformancePreset();
   assert.equal(display.getState().cityViewDistance,250);assert.equal(display.getState().hud,true);
   s.restoreFullDetail();assert.equal(display.getState().dpr,1.5);assert.equal(display.getState().shadows,true);
   s.baseline();s.restoreFullDetail();assert.equal(display.getState().cityViewDistance,750);assert.equal(display.getState().hud,true);
  });
  await t.test('manual brackets choose the nearest intersected vehicle and follow the hull in screen pixels',async()=>{
   const {sightedTarget,projectAssistFrame}=await load('combat/assistFrame.ts');
   const me={id:'me',team:'blue',room_id:1,position:[0,0,0],rotation:[0,0,0,1],health:{hp:500},combat:{enabled:true,x:0,y:.4,z:0,yaw:0,pitch:0}};
   const foe={...me,id:'foe',team:'red',position:[0,0,-15]};
   const entities=[me,{...foe,id:'far',position:[0,0,-24]},{...foe,id:'peer',team:'blue',position:[0,0,-8]},foe];
   assert.equal(sightedTarget({entities},me),'peer');
   assert.equal(sightedTarget({entities:[me,foe]},me),'foe');
   assert.equal(sightedTarget({entities}, {...me,combat:{...me.combat,yaw:Math.PI/2}}),null);
   assert.equal(sightedTarget({entities},{...me,combat:{...me.combat,assisted_target:'far'}}),'far');
   const camera=new PerspectiveCamera(60,2,.1,150);camera.updateMatrixWorld();
   const rect=projectAssistFrame(foe,camera,new Vector3(0,.2,0),1000,500);
   assert(rect.width>40&&rect.height>20);assert.equal(Math.abs(rect.left*2+rect.width)<=1,true);
   assert.equal(projectAssistFrame({...foe,position:[0,0,5]},camera,new Vector3(),1000,500),null);
  });
 }finally{await vite.close();}
});
