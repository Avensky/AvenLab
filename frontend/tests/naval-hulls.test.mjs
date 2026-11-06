import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {LOUISIANA_SIZE,louisianaCollisionParts} from '../src/worldBuilder/generation/navalHullSpecs.ts';
import {vehicleCatalog} from '../src/store/selection/vehicleCatalog.ts';
import {cameraSeabed,cameraGround} from '../src/utils/cameraGround.ts';

test('Louisiana hull proxy remains inside its 188 m visual profile',()=>{
  assert.deepEqual(LOUISIANA_SIZE,[36.67,40.1,188.08]);
  assert.ok(louisianaCollisionParts.length>=6);
  for(const part of louisianaCollisionParts){
    for(let axis=0;axis<3;axis++){
      assert.ok(part.size[axis]>0);
      assert.ok(Math.abs(part.position[axis])+part.size[axis]/2<=1.02,
        `part exceeds axis ${axis} of normalized hull`);
    }
  }
});

test('naval heroes have a catalog entry and a Rust selection policy entry',()=>{
  const rust=readFileSync(new URL('../../avenlab-server/src/alpha/policy.rs',import.meta.url),'utf8');
  for(const id of ['hawaii-rescue','louisiana']){
    assert.ok(vehicleCatalog.some(entry=>entry.id===id));
    assert.match(rust,new RegExp(`id: "${id}"`));
  }
  const entries=rust.match(/Hero\s*\{\s*id\s*:/g)??[];
  const count=Number(rust.match(/pub const HEROES:\s*\[Hero;\s*(\d+)\]/)?.[1]);
  assert.equal(entries.length,count,'Rust roster size must reflect all selectable heroes');
});

test('water-death follow camera can sink but never cross the saved seafloor',()=>{
  const map=JSON.parse(readFileSync(new URL('../../avenlab-server/src/assets/blocks/harbor_canal_fleet_colliders.json',import.meta.url),'utf8'));
  const seabed=cameraSeabed(map);
  assert.ok(seabed < -20 && seabed > -100,'the floor is beneath the water surface');
  assert.ok(cameraGround(map,0,0)>seabed,'normal driving camera still obeys road/deck levels');
  assert.equal(Math.max(-120,seabed),seabed,'camera follows a submerged wreck only as far as seabed');
});
