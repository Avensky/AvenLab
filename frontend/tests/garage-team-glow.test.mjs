import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh,MeshStandardMaterial,BoxGeometry} from 'three';
import {garageTeamAccent,TEAM_GARAGE_LIGHT_COLORS} from '../src/game/preview/garageTeamAccent.ts';
import {SELECTION_CRIMSON,GARAGE_LIGHT_COLORS,tagGarageAccent,applyGarageLighting} from '../src/theme/garageLighting.ts';
import {createGarageReflectionSnapshot} from '../src/game/preview/garageReflectionSnapshot.ts';
import {MATCH_TEAM_COLORS} from '../src/theme/matchTeamTheme.ts';

const active=(team,mode='quickplay')=>({mode,team,world_id:3,hero:'tank'});

test('only confirmed match staging selects a transient team accent',()=>{
 for(const screen of ['hero_select','queue'])for(const mode of ['quickplay','competitive','skirmish']){
  assert.equal(garageTeamAccent(screen,active('red',mode)),TEAM_GARAGE_LIGHT_COLORS.red);
  assert.equal(garageTeamAccent(screen,active('blue',mode)),GARAGE_LIGHT_COLORS.navy);
 }
 assert.equal(TEAM_GARAGE_LIGHT_COLORS.red,MATCH_TEAM_COLORS.red.glow);
 assert.notEqual(TEAM_GARAGE_LIGHT_COLORS.red,GARAGE_LIGHT_COLORS.strawberry);
 for(const screen of ['heroes','main','mode_select','sandbox','world_builder','career'])assert.equal(garageTeamAccent(screen,active('red')),null);
 assert.equal(garageTeamAccent('hero_select',undefined),null);
 assert.equal(garageTeamAccent('hero_select',null),null);
 assert.equal(garageTeamAccent('hero_select',active('unknown')),null);
 for(const mode of ['sandbox','editor'])assert.equal(garageTeamAccent('hero_select',active('red',mode)),null);
});

test('team fixture tint and the first owned reflection agree, then restore the player palette without touching neutral paint',()=>{
 const root=new Group(),geometry=new BoxGeometry(),fixture=new MeshStandardMaterial({emissive:0x00ff00,emissiveIntensity:4}),neutral=new MeshStandardMaterial({color:0x667788});
 tagGarageAccent(fixture);const light=new Mesh(geometry,fixture);light.name='team-light';root.add(light,new Mesh(geometry,neutral));const originalPaint=neutral.color.clone();
 try{
  for(const team of ['red','blue']){
   const accent=garageTeamAccent('hero_select',active(team));applyGarageLighting(root,'strawberry',false,.75,accent);
   assert.equal('#'+fixture.emissive.getHexString(),TEAM_GARAGE_LIGHT_COLORS[team]);
   const probe=createGarageReflectionSnapshot([root],'strawberry',false,.75,accent);
   assert.equal('#'+probe.root.getObjectByName('team-light').material.emissive.getHexString(),TEAM_GARAGE_LIGHT_COLORS[team]);
   assert.notEqual(probe.root.getObjectByName('team-light').material,fixture);probe.dispose();
   assert.equal(neutral.color.equals(originalPaint),true);
  }
  applyGarageLighting(root,'strawberry',false,.75,garageTeamAccent('heroes',active('red')));
  assert.equal('#'+fixture.emissive.getHexString(),GARAGE_LIGHT_COLORS.strawberry);
  applyGarageLighting(root,'strawberry',true,.75,TEAM_GARAGE_LIGHT_COLORS.red);
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
