import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act, createElement, StrictMode, Suspense, useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {useCommittedResource} from '../src/game/characters/useCommittedResource.ts';

test('committed resources survive effect replay and release each real model once', async()=>{
 const dom=new JSDOM('<div id="root"></div>');
 const values={window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true};
 const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true});
 const root=createRoot(document.getElementById('root')),created=[],disposed=[];
 let active;
 function Model({rig,color,suspend=false}) {
  const createResource=useCallback(()=>{
   const item={rig,dispose(){disposed.push(item);}};created.push(item);return item;
  },[rig]);
  const resource=useCommittedResource(createResource);
  if(suspend)throw new Promise(()=>{});
  active=resource;
  return createElement('span',{'data-color':color},resource?.rig);
 }
 const render=props=>act(async()=>root.render(createElement(StrictMode,null,
  createElement(Suspense,{fallback:createElement('span',null,'Loading')},createElement(Model,props)))));
 try {
  await render({rig:'skirt-1',color:'red'});
  assert.equal(created.length,1,'effect replay reuses the committed resource');
  assert.equal(active,created[0]);assert.deepEqual(disposed,[]);
  await render({rig:'skirt-1',color:'blue'});
  assert.equal(created.length,1,'dye changes allocate no new rig');
  await render({rig:'skirt-2',color:'blue'});
  assert.equal(created.length,2);assert.equal(active,created[1]);
  assert.deepEqual(disposed,[created[0]]);
  await render({rig:'uncommitted',color:'blue',suspend:true});
  assert.equal(created.length,2,'a suspended render allocates no disposable geometry');
 } finally {
  await act(async()=>root.unmount());
  assert.deepEqual(disposed,created,'all committed resources are disposed once');
  dom.window.close();
  for(const [key,descriptor] of Object.entries(previous)){
   if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
 }
});
