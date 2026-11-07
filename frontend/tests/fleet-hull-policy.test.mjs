import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh,BoxGeometry,MeshBasicMaterial,Vector3} from 'three';
import {cloneStaticHull,fleetDetailDistance} from '../src/world/props/fleetHullPolicy.ts';

test('fleet detail follows the graphics preset without removing Original quality',()=>{
  assert.equal(fleetDetailDistance('fast',430),null);
  assert.equal(fleetDetailDistance('balanced',430),160);
  assert.equal(fleetDetailDistance('balanced',90),90);
  assert.equal(fleetDetailDistance('original',430),430);
});

test('static hull instances share resources, preserve source nodes and move with the editor parent',()=>{
  const source=new Group(),geometry=new BoxGeometry(),material=new MeshBasicMaterial();
  const deck=new Mesh(geometry,material);deck.position.set(2,3,4);source.add(deck);
  const a=cloneStaticHull(source),b=cloneStaticHull(source);
  assert.notEqual(a,b);assert.notEqual(a.children[0],b.children[0]);
  assert.equal(a.children[0].geometry,geometry);assert.equal(b.children[0].material,material);
  assert.equal(source.matrixAutoUpdate,true);assert.equal(deck.matrixAutoUpdate,true);
  a.traverse(node=>assert.equal(node.matrixAutoUpdate,false));
  const parent=new Group();parent.add(a);parent.position.x=10;parent.updateMatrixWorld(true);
  assert.deepEqual(a.children[0].getWorldPosition(new Vector3()).toArray(),[12,3,4]);
  parent.position.x=20;parent.updateMatrixWorld(true);
  assert.deepEqual(a.children[0].getWorldPosition(new Vector3()).toArray(),[22,3,4]);
  geometry.dispose();material.dispose();
});
