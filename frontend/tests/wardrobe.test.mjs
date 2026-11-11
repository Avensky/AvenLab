import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';

test('wardrobe coverage stays on, mask buffers are isolated, and layer changes reuse buffers', async () => {
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
 try {
  const {resolveWardrobe,prepareWardrobe,wardrobeModelUrl}=await vite.ssrLoadModule('/src/game/characters/wardrobe.ts');
  assert.equal(resolveWardrobe({set:'../file',shirt:'none',waist:'tucked'}),undefined);
  assert.equal(resolveWardrobe({set:'gothic-04',shirt:'none',waist:'tucked'}).shirt,'under');
  assert.equal(wardrobeModelUrl({set:'unknown',shirt:'under',waist:'over'},'garage'),null);
  const {characterLook}=await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
  assert.equal(characterLook({id:'jules-okafor',outfit:'race-crew',wardrobe:{set:'gothic-01',shirt:'under',waist:'over'}}).wardrobe,undefined);
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,0,1,0,1,1,0],3));
  geometry.setAttribute('_aven_coverage',new Float32BufferAttribute([4,4,4,0],1));
  geometry.setIndex([0,1,2,1,2,3]);
  const build=()=>{
   const root=new Group(),body=new Mesh(geometry,new MeshStandardMaterial());body.userData.wardrobeRole='body';root.add(body);
   for(const role of ['bottom','shorts','corset-tucked','corset-over','shirt-under','shirt-over-tucked','shirt-over-over']){
    const part=new Group();part.name=role;part.userData.wardrobeRole=role;root.add(part);
   }
   return {root,body,wardrobe:prepareWardrobe(root)};
  };
  const a=build(),b=build();
  a.wardrobe.apply({set:'gothic-04',shirt:'none',waist:'tucked'});
  assert(a.root.getObjectByName('shirt-under').visible);
  assert(a.root.getObjectByName('shorts').visible);
  assert(!a.root.getObjectByName('shirt-over-over').visible);
  assert.equal(a.body.geometry.drawRange.count,3);
  assert.equal(b.body.geometry.index.count,6);
  assert.deepEqual([...geometry.index.array],[0,1,2,1,2,3]);
  const buffer=a.body.geometry.index, version=buffer.version;
  a.wardrobe.apply({set:'gothic-04',shirt:'under',waist:'tucked'});
  assert.equal(buffer.version,version,'unchanged layer does no buffer work');
  a.wardrobe.apply({set:'gothic-01',shirt:'over',waist:'over'});
  assert.equal(a.body.geometry.index,buffer,'switches keep one GPU index allocation');
  assert.equal(a.body.geometry.drawRange.count,6);
  assert(a.root.getObjectByName('shirt-over-over').visible);
  assert(a.root.getObjectByName('corset-over').visible);
  assert(!a.root.getObjectByName('corset-tucked').visible);
  assert(a.root.getObjectByName('shorts').visible);
  a.wardrobe.dispose();b.wardrobe.dispose();
  assert.equal(a.body.geometry,geometry);
  assert.deepEqual([...geometry.index.array],[0,1,2,1,2,3]);
 }finally{await vite.close();}
});

test('Dressing room saves layers on the current character and keeps the open-front shirt required', async () => {
 const {JSDOM}=await import('jsdom');const {act,createElement:h}=await import('react');const {createRoot}=await import('react-dom/client');
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),original=new Map();let root,vite;
 const globals={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true};
 for(const[k,v]of Object.entries(globals)){original.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});}
 HTMLElement.prototype.scrollIntoView=()=>{};
 try{
  vite=await createServer({define:{__WARDROBE_SET_IDS__:JSON.stringify(['gothic-01','gothic-02','gothic-03','gothic-04','gothic-05'])},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  const {CharacterPage}=await vite.ssrLoadModule('/src/game/characters/CharacterPage.tsx');
  const {DEFAULT_CHARACTER}=await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
  const {useSocialStore:social}=await vite.ssrLoadModule('/src/store/social/socialStore.ts');
  const client=await vite.ssrLoadModule('/src/net/socialClient.ts');const requests=[],previews=[];
  client.setSocialConnection({readyState:WebSocket.OPEN,send:value=>requests.push(JSON.parse(value))});
  const character={...DEFAULT_CHARACTER,prop:'shop-bag',identity:'nonbinary'};
  social.setState({view:{profile:{id:'wardrobe-test',name:'Driver',progression:{character}}}});
  const beforeClose={current:null};root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(h(CharacterPage,{tab:'appearance',beforeClose,onReady:()=>{},onPreview:c=>previews.push(c)})));
  const click=async(selector)=>act(async()=>{const button=document.querySelector(selector);assert(button,selector);button.click();});
  const layer=async(label)=>act(async()=>{const button=[...document.querySelectorAll('.dressing-layer-options button')].find(e=>e.textContent===label);assert(button,label);button.click();});
  await click('[data-category=tops]');
  assert.equal(document.querySelectorAll('[data-wardrobe-item^="gothic-"]').length,5);
  assert.equal(requests.length,0,'browsing categories does not save');
  await click('[data-wardrobe-item=gothic-01]');await layer('Over corset');await layer('Over skirt');
  assert.deepEqual(previews.at(-1).wardrobe,{set:'gothic-01',shirt:'over',waist:'over'});
  await layer('Corset only');await click('[data-wardrobe-item=gothic-04]');
  assert.equal(previews.at(-1).wardrobe.shirt,'under');
  assert([...document.querySelectorAll('.dressing-layer-options button')].find(e=>e.textContent==='Corset only').disabled);
  assert.equal(previews.at(-1).prop,'shop-bag');assert.equal(previews.at(-1).identity,'nonbinary');
  // Flush only the latest draft, as closing the tab does in the actual menu.
  let pending;
  await act(async()=>{pending=beforeClose.current();});
  assert.equal(requests.length,1);assert.equal(requests[0].character.wardrobe.set,'gothic-04');
  await act(async()=>{client.receiveSocialResult({request_id:requests[0].request_id,ok:true,data:{character:requests[0].character}});await pending;});
  assert.deepEqual(social.getState().view.profile.progression.character.wardrobe,{set:'gothic-04',shirt:'under',waist:'over'});
 }finally{
  if(root)await act(async()=>root.unmount());await vite?.close();dom.window.close();
  for(const[k,d]of original){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}
 }
});
