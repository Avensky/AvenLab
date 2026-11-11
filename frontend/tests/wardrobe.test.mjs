import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';

test('retired wardrobe presets fall back to the base model while remaining available for archival validation', async () => {
 const vite=await createServer({define:{__WARDROBE_SET_IDS__:JSON.stringify(['gothic-04','gothic-05'])},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
 try {
  const {resolveWardrobe,wardrobeModelUrl}=await vite.ssrLoadModule('/src/game/characters/wardrobe.ts');
  const {DEFAULT_CHARACTER,characterLook}=await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
  const {villagerModelUrl}=await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
  const archived={set:'gothic-04',shirt:'under',waist:'over'};
  assert.equal(resolveWardrobe(archived),undefined);
  assert.deepEqual(resolveWardrobe(archived,{includeRetired:true}),{set:'gothic-04',shirt:'none',waist:'over'});
  const saved={...DEFAULT_CHARACTER,wardrobe:archived};
  const look=characterLook(saved);
  const stock=characterLook(DEFAULT_CHARACTER);
  assert.equal(look.wardrobe,undefined);
  for(const view of ['garage','portrait']){
   assert.equal(wardrobeModelUrl(archived,view),null);
   assert.equal(villagerModelUrl(look,view),villagerModelUrl(stock,view));
  }
  assert.deepEqual(saved.wardrobe,{set:'gothic-04',shirt:'under',waist:'over'},'loading a retired preset preserves the saved selection');
 }finally{await vite.close();}
});

test('wardrobe coverage stays on, mask buffers are isolated, and layer changes reuse buffers', async () => {
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
 try {
  const {resolveWardrobe,prepareWardrobe,wardrobeModelUrl}=await vite.ssrLoadModule('/src/game/characters/wardrobe.ts');
  assert.equal(resolveWardrobe({set:'../file',shirt:'none',waist:'tucked'}),undefined);
  for(const shirt of ['none','under','over'])for(const waist of ['tucked','over']){
   assert.deepEqual(resolveWardrobe({set:'gothic-05',shirt,waist}),{set:'gothic-05',shirt:'none',waist});
  }
  assert.equal(wardrobeModelUrl({set:'unknown',shirt:'under',waist:'over'},'garage'),null);
  const {characterLook}=await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
  assert.equal(characterLook({id:'jules-okafor',outfit:'race-crew',wardrobe:{set:'gothic-01',shirt:'under',waist:'over'}}).wardrobe,undefined);
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,0,1,0,1,1,0],3));
  geometry.setAttribute('_aven_coverage',new Float32BufferAttribute([2,2,2,0],1));
  geometry.setIndex([0,1,2,1,2,3]);
  const build=()=>{
   const root=new Group(),body=new Mesh(geometry,new MeshStandardMaterial());body.userData.wardrobeRole='body';root.add(body);
   for(const role of ['bottom','shorts','corset-tucked','corset-over','shirt-under','shirt-over-tucked','shirt-over-over']){
    const part=new Group();part.name=role;part.userData.wardrobeRole=role;root.add(part);
   }
   return {root,body,wardrobe:prepareWardrobe(root)};
  };
  const a=build(),b=build();
  a.wardrobe.apply({set:'gothic-05',shirt:'none',waist:'tucked'});
  assert(a.root.getObjectByName('corset-tucked').visible);
  assert(!a.root.getObjectByName('shirt-under').visible);
  assert.equal(a.root.getObjectByName('shorts').visible,false);
  assert(!a.root.getObjectByName('shirt-over-over').visible);
  assert.equal(a.body.geometry.drawRange.count,6);
  assert.equal(b.body.geometry.index.count,6);
  assert.deepEqual([...geometry.index.array],[0,1,2,1,2,3]);
  const buffer=a.body.geometry.index;
  const version=buffer.version;
  a.wardrobe.apply({set:'gothic-05',shirt:'under',waist:'tucked'});
  assert(!a.root.getObjectByName('shirt-under').visible);
  assert.equal(buffer.version,version,'legacy shirt changes do no buffer work');
  a.wardrobe.apply({set:'gothic-05',shirt:'over',waist:'over'});
  assert.equal(a.body.geometry.index,buffer,'switches keep one GPU index allocation');
  assert.equal(a.body.geometry.drawRange.count,3);
  assert(!a.root.getObjectByName('shirt-over-over').visible);
  assert(a.root.getObjectByName('corset-over').visible);
  assert(!a.root.getObjectByName('corset-tucked').visible);
  assert.equal(a.root.getObjectByName('shorts').visible,false);
  a.wardrobe.dispose();b.wardrobe.dispose();
  assert.equal(a.body.geometry,geometry);
  assert.deepEqual([...geometry.index.array],[0,1,2,1,2,3]);
 }finally{await vite.close();}
});

test('Dressing room saves corset waist fits without separate shirts on the current character', async () => {
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
  const character={...DEFAULT_CHARACTER,prop:'shop-bag',identity:'nonbinary',wardrobe:{set:'gothic-04',shirt:'under',waist:'tucked'}};
  social.setState({view:{profile:{id:'wardrobe-test',name:'Driver',progression:{character}}}});
  const beforeClose={current:null};root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(h(CharacterPage,{tab:'appearance',beforeClose,onReady:()=>{},onPreview:c=>previews.push(c)})));
  const click=async(selector)=>act(async()=>{const button=document.querySelector(selector);assert(button,selector);button.click();});
  const layer=async(label)=>act(async()=>{const button=[...document.querySelectorAll('.dressing-layer-options button')].find(e=>e.textContent===label);assert(button,label);button.click();});
  await click('[data-category=tops]');
  assert.equal(document.querySelectorAll('[data-wardrobe-item^="gothic-"]').length,4);
  assert.equal(document.querySelector('[data-wardrobe-item="gothic-04"]'),null);
  assert.deepEqual(previews.at(-1).wardrobe,character.wardrobe,'opening the editor preserves the retired preset');
  assert.equal(requests.length,0,'browsing categories does not save');
  await click('[data-wardrobe-item=gothic-03]');
  assert.deepEqual(previews.at(-1).wardrobe,{set:'gothic-03',shirt:'none',waist:'over'},'Ruffled equips the reviewed over-skirt fit by default');
  await layer('Tucked into skirt');
  await click('[data-wardrobe-item=gothic-03]');
  assert.equal(previews.at(-1).wardrobe.waist,'tucked','reselecting Ruffled preserves the active fit');
  await click('[data-wardrobe-item=gothic-01]');await layer('Over skirt');
  assert.deepEqual(previews.at(-1).wardrobe,{set:'gothic-01',shirt:'none',waist:'over'});
  await click('[data-wardrobe-item=gothic-05]');
  assert.deepEqual(previews.at(-1).wardrobe,{set:'gothic-05',shirt:'none',waist:'over'});
  assert.equal(document.querySelector('[aria-label="Shirt layer"]'),null);
  assert.equal(document.querySelector('[data-dressing-piece="shirt"]'),null);
  assert.equal(previews.at(-1).prop,'shop-bag');assert.equal(previews.at(-1).identity,'nonbinary');
  // Flush only the latest draft, as closing the tab does in the actual menu.
  let pending;
  await act(async()=>{pending=beforeClose.current();});
  assert.equal(requests.length,1);assert.equal(requests[0].character.wardrobe.set,'gothic-05');
  await act(async()=>{client.receiveSocialResult({request_id:requests[0].request_id,ok:true,data:{character:requests[0].character}});await pending;});
  assert.deepEqual(social.getState().view.profile.progression.character.wardrobe,{set:'gothic-05',shirt:'none',waist:'over'});
 }finally{
  if(root)await act(async()=>root.unmount());await vite?.close();dom.window.close();
  for(const[k,d]of original){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}
 }
});
