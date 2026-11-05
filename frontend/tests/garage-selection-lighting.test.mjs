import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh,MeshStandardMaterial,BoxGeometry} from 'three';
import {SELECTION_CRIMSON,GARAGE_LIGHT_COLORS,tagGarageAccent,applyGarageLighting} from '../src/theme/garageLighting.ts';
import {createGarageReflectionSnapshot} from '../src/game/preview/garageReflectionSnapshot.ts';

test('saved-theme fixtures and their first owned reflection agree without touching neutral paint',()=>{
 const root=new Group(),geometry=new BoxGeometry(),fixture=new MeshStandardMaterial({emissive:0x00ff00,emissiveIntensity:4}),neutral=new MeshStandardMaterial({color:0x667788});
 tagGarageAccent(fixture);const light=new Mesh(geometry,fixture);light.name='theme-light';root.add(light,new Mesh(geometry,neutral));const originalPaint=neutral.color.clone();
 try{
  for(const [theme,color] of Object.entries(GARAGE_LIGHT_COLORS)){
   applyGarageLighting(root,theme,false,.75);
   assert.equal('#'+fixture.emissive.getHexString(),color);
   const probe=createGarageReflectionSnapshot([root],theme,false,.75);
   assert.equal('#'+probe.root.getObjectByName('theme-light').material.emissive.getHexString(),color);
   assert.notEqual(probe.root.getObjectByName('theme-light').material,fixture);probe.dispose();
   assert.equal(neutral.color.equals(originalPaint),true);
  }
  applyGarageLighting(root,'strawberry',true,.75);
  assert.equal(fixture.emissive.getHexString(),'ffffff','high contrast accessibility stays authoritative');
  assert.equal(neutral.color.equals(originalPaint),true);
 }finally{geometry.dispose();fixture.dispose();neutral.dispose();}
});

test('muted crimson staging lowers the actual fixture emission and its reflected copy',()=>{
 const material=new MeshStandardMaterial({emissive:0xffffff});tagGarageAccent(material,true);
 const root=new Group();root.add(new Mesh(new BoxGeometry(),material));
 applyGarageLighting(root,'scarlet',false,1);
 const normal=material.emissive.r*material.emissiveIntensity;
 applyGarageLighting(root,'scarlet',false,1,SELECTION_CRIMSON);
 assert(material.emissive.r*material.emissiveIntensity < normal*.5);
 const snapshot=createGarageReflectionSnapshot([root],'scarlet',false,1,SELECTION_CRIMSON);
 const reflected=snapshot.root.children[0].children[0].material;
 assert.equal(reflected.emissiveIntensity,material.emissiveIntensity);assert(reflected.emissive.equals(material.emissive));
 snapshot.dispose();root.children[0].geometry.dispose();material.dispose();
});
