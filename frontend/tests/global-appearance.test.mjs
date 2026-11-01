import test from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,Group,BoxGeometry,MeshPhysicalMaterial,MeshStandardMaterial,Texture} from 'three';
import {sanitizeVehicleCosmetics,COSMETIC_BUNDLES,COSMETIC_ITEMS} from '../src/vehicles/cosmetics/catalog.ts';
import {applyShowroomHighlights,applyShowroomPaint} from '../src/game/preview/garageVehiclePaint.ts';
test('cosmetic persistence validates IDs; bundle items resolve without granting entitlements',()=>{
 assert.deepEqual(sanitizeVehicleCosmetics({bundle:'paid-admin',finish:'nan',matchCockpit:'yes'}),{bundle:'factory',finish:'frs',matchCockpit:true});
 for(const bundle of Object.values(COSMETIC_BUNDLES))for(const item of bundle.items){assert(COSMETIC_ITEMS[item]);assert.equal(COSMETIC_ITEMS[item].previewOnly,true);}
});
test('FR-S reference and factory restoration affect body only, without drifting physical clearcoat',()=>{
 const root=new Group(),body=new MeshPhysicalMaterial({roughness:.6,clearcoatRoughness:.7});body.name='body';
 const glass=new MeshPhysicalMaterial({roughness:.01});glass.name='window';const geometry=new BoxGeometry();root.add(new Mesh(geometry,[body,glass]));
 for(let i=0;i<3;i++){applyShowroomHighlights(root,.7,'frs');assert.equal(body.roughness,.20529644);assert.equal(body.clearcoatRoughness,.04);applyShowroomHighlights(root,.7,'factory');assert.equal(body.roughness,.6);assert.equal(body.clearcoatRoughness,.7);}
 assert.equal(glass.roughness,.01);geometry.dispose();body.dispose();glass.dispose();
});
test('white Camaro body preview retains the atlas and can return to pink or factory',()=>{
 const root=new Group(),map=new Texture(),body=new MeshStandardMaterial({color:0xaabbcc,map});body.name='ext.001';const geometry=new BoxGeometry();root.add(new Mesh(geometry,body));
 applyShowroomPaint(root,'camaro','factory','#f4f5f7');assert.equal(body.color.getHexString(),'f4f5f7');assert.equal(body.map,map);
 applyShowroomPaint(root,'camaro','hot-pink');assert.equal(body.color.getHexString(),'ed258d');applyShowroomPaint(root,'camaro','factory');assert.equal(body.color.getHexString(),'aabbcc');
 geometry.dispose();body.dispose();map.dispose();
});
