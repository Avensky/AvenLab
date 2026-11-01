import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh,BoxGeometry,MeshStandardMaterial,MeshPhysicalMaterial,Texture} from 'three';
import {prepareVehicleVisual} from '../src/vehicles/tools/vehicleMaterials.ts';
import {applyShowroomPaint,applyShowroomHighlights} from '../src/game/preview/garageVehiclePaint.ts';
import {repairAe86Material,repairSupraHighlights} from '../src/vehicles/tools/assetMaterialRepairs.ts';

test('AE86 missing material colors are repaired on owned clones, preserving glass and authored colors',()=>{
 const root=new Group(),geometry=new BoxGeometry();
 const names=['TireMaterial.002','RimMaterial.002','Interior.002','Seatbelt.002','Windows.002'];
 const materials=names.map(name=>{const m=new MeshStandardMaterial({color:0xffffff});m.name=name;return m;});
 root.add(new Mesh(geometry,materials));const prepared=prepareVehicleVisual(root,'ae86');
 const fixed=prepared.root.children[0].material;
 assert(fixed[0].color.r<.02);assert.equal(fixed[0].metalness,0);assert(fixed[1].color.r>.1&&fixed[1].color.r<.5);assert(fixed[2].color.r<.05);assert.equal(fixed[4].color.r,1);
 assert(materials.every(m=>m.color.r===1));
 const custom=new MeshStandardMaterial({color:0xcc3333});custom.name='RimMaterial.002';const before=custom.color.clone();repairAe86Material(custom);assert(custom.color.equals(before));
 prepared.dispose();geometry.dispose();materials.forEach(m=>m.dispose());custom.dispose();
});
test('Camaro paint keeps the exterior texture and factory restoration while leaving trim alone',()=>{
 const root=new Group(),geometry=new BoxGeometry(),texture=new Texture();
 const body=new MeshStandardMaterial({map:texture,color:0xffffff});body.name='ext.001';
 const trim=new MeshStandardMaterial({color:0x222222});trim.name='misc.001';root.add(new Mesh(geometry,[body,trim]));
 const base=body.color.clone(),trimColor=trim.color.clone();applyShowroomPaint(root,'camaro','hot-pink');assert(!body.color.equals(base));assert.equal(body.map,texture);assert(trim.color.equals(trimColor));
 applyShowroomPaint(root,'camaro','factory');assert(body.color.equals(base));geometry.dispose();body.dispose();trim.dispose();texture.dispose();
});
test('Supra sharp HDR highlights are bounded, with shared softer body finish and untouched glass',()=>{
 const root=new Group(),geometry=new BoxGeometry();
 const paint=new MeshPhysicalMaterial({roughness:0,specularColor:0xffffff});paint.specularColor.setRGB(2,2,2);paint.name='t:Toyota_GRSupraTNR6_2020PaintTNR_Material1';
 const glass=new MeshPhysicalMaterial({roughness:0});glass.name='Window_Material1';
 repairSupraHighlights(paint);repairSupraHighlights(glass);assert.equal(paint.roughness,.28);assert.equal(paint.specularColor.r,1);assert.equal(glass.roughness,0);
 root.add(new Mesh(geometry,[paint,glass]));applyShowroomHighlights(root,.65);const finish=paint.roughness;assert(finish>.45);applyShowroomHighlights(root,.65);assert.equal(paint.roughness,finish);applyShowroomHighlights(root,0);assert.equal(paint.roughness,.28);assert.equal(glass.roughness,0);
 geometry.dispose();paint.dispose();glass.dispose();
});
