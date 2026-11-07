import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MarkerSightBudget,hasSightBlocker} from '../src/combat/markerSight.ts';
import {Group,Mesh,InstancedMesh,Matrix4,BoxGeometry,MeshBasicMaterial,Raycaster,Vector3} from 'three';

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

test('HUD sight never invokes detailed triangle raycasts and handles instanced bounds',()=>{
 const scene=new Group(),geometry=new BoxGeometry(),material=new MeshBasicMaterial();
 const ship=new Mesh(geometry,material);
 ship.position.set(10,0,-4);
 ship.raycast=()=>{throw Error('triangle raycast must not run for HUD labels');};
 scene.add(ship);
 const instances=new InstancedMesh(geometry,material,2);
 instances.setMatrixAt(0,new Matrix4().makeTranslation(-10,0,-4));
 instances.setMatrixAt(1,new Matrix4().makeTranslation(0,0,-4));
 instances.raycast=()=>{throw Error('instanced triangle raycast must not run');};
 scene.add(instances);scene.updateMatrixWorld(true);
 const ray=new Raycaster(new Vector3(),new Vector3(0,0,-1),.01,8);
 assert.equal(hasSightBlocker(scene,ray,[]),true);
 instances.count=1;
 assert.equal(hasSightBlocker(scene,ray,[]),false,'space between separated instance bounds stays visible');
 geometry.dispose();material.dispose();
});

test('a camera inside a merged hull does not expose a label before the bounds exit',()=>{
 const geometry=new BoxGeometry(30,30,30),material=new MeshBasicMaterial();
 const hull=new Mesh(geometry,material);hull.updateMatrixWorld(true);
 const ray=new Raycaster(new Vector3(),new Vector3(0,0,-1),.01,4);
 assert.equal(hasSightBlocker(hull,ray,[]),true);
 geometry.dispose();material.dispose();
});
