import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MarkerSightBudget,hasSightBlocker} from '../src/combat/markerSight.ts';
import {Group,Mesh,BoxGeometry,MeshBasicMaterial,Raycaster,Vector3} from 'three';

test('health labels share fair sight checks and preserve visible mesh obstructions',()=>{
  for(const count of [5,9]){
   const budget=new MarkerSightBudget(),checks=Array(count).fill(0);
   for(let frame=0;frame<60;frame++){
    const now=frame*1000/60;
    for(let i=0;i<count;i++)if(budget.claim(String(i),now))checks[i]++;
   }
   assert(checks.every(n=>n>0));assert(Math.max(...checks)-Math.min(...checks)<=1);
   assert(checks.reduce((x,y)=>x+y)<=20);
  }
  const scene=new Group(),hidden=new Group();hidden.visible=false;scene.add(hidden);
  const mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial());mesh.position.z=-4;hidden.add(mesh);
  scene.updateMatrixWorld(true);const ray=new Raycaster(new Vector3(),new Vector3(0,0,-1),.01,8);
  assert.equal(hasSightBlocker(scene,ray,[]),false);
  hidden.visible=true;assert.equal(hasSightBlocker(scene,ray,[]),true);
  hidden.userData.hudSightTransparent=true;assert.equal(hasSightBlocker(scene,ray,[]),false);
  hidden.userData.hudSightTransparent=false;
  ray.far=2;assert.equal(hasSightBlocker(scene,ray,[]),false);
  ray.far=8;mesh.layers.set(2);assert.equal(hasSightBlocker(scene,ray,[]),false);
  mesh.geometry.dispose();mesh.material.dispose();
});
