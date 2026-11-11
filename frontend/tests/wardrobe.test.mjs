import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';

test('saved Underbust presets fall back and standalone corsets select an available model tier', async () => {
 const vite=await createServer({define:{__WARDROBE_SET_IDS__:JSON.stringify(['gothic-04','gothic-05']),
  __STANDALONE_CORSET_LODS__:JSON.stringify({'gothic-02':{garage:true,mobile:false},'gothic-04':{garage:true,mobile:true},'gothic-05':{garage:false,mobile:true}}),
  __BUNDLED_WARDROBE_LODS__:JSON.stringify({'gothic-01':{garage:true,mobile:false},'gothic-05':{garage:true,mobile:true}})},
  server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
 try {
  const {corsetModelUrl,resolveWardrobe,wardrobeModelUrl}=await vite.ssrLoadModule('/src/game/characters/wardrobe.ts');
  const {DEFAULT_CHARACTER,characterLook}=await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
  const {villagerModelUrl}=await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
  const {wornClothing}=await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
  const archived={set:'gothic-04',shirt:'under',waist:'over'};
  assert.equal(resolveWardrobe(archived),undefined);
  assert.deepEqual(resolveWardrobe(archived,{includeRetired:true}),{set:'gothic-04',shirt:'none',waist:'over'});
  const saved={...DEFAULT_CHARACTER,wardrobe:archived};
  const look=characterLook(saved);
  const stock=characterLook(DEFAULT_CHARACTER);
  const trial={...saved,wardrobeTrial:archived};
  const trialLook=characterLook(trial);
  assert.equal(look.wardrobe,undefined);
  for(const view of ['garage','portrait']){
   assert.equal(wardrobeModelUrl(archived,view),null);
   assert.equal(villagerModelUrl(look,view),villagerModelUrl(stock,view));
   assert.equal(villagerModelUrl(trialLook,view),villagerModelUrl(stock,view));
   assert.equal(corsetModelUrl(trialLook.corset,view),`/models/characters/female/wardrobe/corsets/gothic-04.${view==='garage'?'garage':'mobile'}.glb`);
  }
  assert(!wornClothing(trial).includes('shirt'));
  const layered = wornClothing({ ...trial, garments: { top: 'top-02' } });
  assert(layered.includes('corset') && layered.includes('shirt'));
  assert(!wornClothing(saved).includes('shirt'));
  assert.match(corsetModelUrl({...archived,set:'gothic-02'},'portrait'),/gothic-02\.garage\.glb$/);
  assert.equal(corsetModelUrl({...archived,set:'gothic-05'},'garage'),'/models/characters/female/wardrobe/corsets/gothic-05.mobile.glb');
  assert.equal(corsetModelUrl({...archived,set:'gothic-01'},'garage'),'/models/characters/wardrobe/gothic-01.garage.glb');
  assert.equal(corsetModelUrl({...archived,set:'gothic-01'},'portrait'),'/models/characters/wardrobe/gothic-01.garage.glb');
  assert.equal(corsetModelUrl({...archived,set:'gothic-03'},'garage'),null);
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

test('Dressing room previews the layered vest and saves approved corset waist fits', async () => {
 const {JSDOM}=await import('jsdom');const {act,createElement:h}=await import('react');const {createRoot}=await import('react-dom/client');
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true}),original=new Map();let root,vite;
 const globals={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true};
 for(const[k,v]of Object.entries(globals)){original.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});}
 HTMLElement.prototype.scrollIntoView=()=>{};
 HTMLElement.prototype.attachEvent=()=>{};
 HTMLElement.prototype.detachEvent=()=>{};
 try{
  vite=await createServer({define:{__WARDROBE_SET_IDS__:JSON.stringify(['gothic-01','gothic-02','gothic-03','gothic-04','gothic-05']),
   __STANDALONE_CORSET_LODS__:JSON.stringify({'gothic-02':{garage:true,mobile:false},'gothic-04':{garage:true,mobile:true}}),
   __DRESSING_ROOM_IMPORTED_IDS__:JSON.stringify(['gothic-skirt-04','top-02'])},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  const {CharacterPage}=await vite.ssrLoadModule('/src/game/characters/CharacterPage.tsx');
  const {DEFAULT_CHARACTER,characterLook}=await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
  const {useSocialStore:social}=await vite.ssrLoadModule('/src/store/social/socialStore.ts');
  const client=await vite.ssrLoadModule('/src/net/socialClient.ts');const requests=[],previews=[];
  client.setSocialConnection({readyState:WebSocket.OPEN,send:value=>requests.push(JSON.parse(value))});
  const character={...DEFAULT_CHARACTER,prop:'shop-bag',identity:'nonbinary',wardrobe:{set:'gothic-04',shirt:'under',waist:'tucked'}};
  social.setState({view:{profile:{id:'wardrobe-test',name:'Driver',progression:{character}}}});
  const beforeClose={current:null};root=createRoot(document.getElementById('root'));
  const pageProps={beforeClose,onReady:()=>{},onPreview:c=>previews.push(c)};
  const showTab=tab=>act(async()=>root.render(h(CharacterPage,{...pageProps,tab})));
  await showTab('appearance');
  const click=async(selector)=>act(async()=>{const button=document.querySelector(selector);assert(button,selector);button.click();});
  const layer=async(label)=>act(async()=>{const button=[...document.querySelectorAll('.dressing-layer-options button')].find(e=>e.textContent===label);assert(button,label);button.click();});
  await click('[data-category=outfits]');
  assert.equal(document.querySelectorAll('[data-wardrobe-item^="gothic-"]').length,3);
  assert.equal(document.querySelector('[data-wardrobe-item="gothic-04"]'),null);
  assert.deepEqual(previews.at(-1).wardrobe,character.wardrobe,'opening the editor preserves the retired preset');
  assert.equal(requests.length,0,'browsing categories does not save');
  await click('[data-wardrobe-back]');
  await click('[data-category=corsets]');
  assert.equal(document.querySelectorAll('[aria-label="Gothic corsets"] [data-wardrobe-item]').length,6);
  await click('[aria-label="Gothic corsets"] [data-wardrobe-item="gothic-02"]');
  assert.equal(previews.at(-1).wardrobeTrial.set,'gothic-02','Sweetheart is selectable with one installed model tier');
  await click('[aria-label="Gothic corsets"] [data-wardrobe-item="gothic-04"]');
  assert.deepEqual(previews.at(-1).wardrobeTrial,{set:'gothic-04',shirt:'none',waist:'over'});
  assert.equal(document.querySelector('[data-dressing-piece="shirt"]'),null);
  await layer('Roomy over skirt');
  assert.equal(previews.at(-1).wardrobeEase,1);
  await layer('Wide over skirt');
  assert.equal(previews.at(-1).wardrobeEase,2);
  await layer('Tucked into skirt');
  assert.equal(previews.at(-1).wardrobeTrial.waist,'tucked');
  assert.equal(previews.at(-1).wardrobeEase,undefined);
  assert.deepEqual(previews.at(-1).wardrobe,character.wardrobe);
  await click('[data-wardrobe-back]');
  await click('[data-category=tops]');
  await click('[data-wardrobe-item="top-02"]');
  assert.equal(previews.at(-1).garments.top,'top-02');
  assert.equal(previews.at(-1).wardrobeTrial.set,'gothic-04','adding a top keeps the vest');
  await click('[data-wardrobe-item="remove-top"]');
  assert.equal(previews.at(-1).garments.top,'top-02','turning off a layer keeps its selection for restore');
  assert.equal(characterLook(previews.at(-1)).garments?.top,undefined);
  assert.equal(characterLook(previews.at(-1)).corset.set,'gothic-04');
  await click('[data-wardrobe-item="remove-top"]');
  assert.equal(characterLook(previews.at(-1)).garments.top,'top-02');
  await click('[data-wardrobe-back]');
  await click('[data-category=corsets]');
  await click('[data-wardrobe-item="gothic-02"]');
  assert.equal(characterLook(previews.at(-1)).garments.top,'top-02','other corsets keep a separately selected top too');
  await click('[data-wardrobe-item="remove-corset"]');
  assert.equal(characterLook(previews.at(-1)).corset,undefined);
  assert.equal(characterLook(previews.at(-1)).garments.top,'top-02');
  await click('[data-wardrobe-item="gothic-04"]');
  assert.equal(previews.at(-1).removedClothing,undefined,'selecting a corset restores that layer');
  assert.equal(previews.at(-1).garments.top,'top-02','reselecting the vest keeps the top');
  assert(document.querySelector('[data-dressing-piece="shirt"]'));
  await click('[data-remove-try-on]');
  assert.equal(previews.at(-1).wardrobeTrial,undefined);
  assert.equal(previews.at(-1).garments.top,'top-02','removing the vest keeps the top');
  await click('[data-wardrobe-item="gothic-04"]');
  assert.equal(previews.at(-1).garments.top,'top-02','adding the vest over a top keeps the top');
  await click('[data-wardrobe-back]');
  await click('[data-category=bottoms]');
  await click('[data-wardrobe-item="gothic-skirt-04"]');
  assert.equal(previews.at(-1).garments.skirt,'gothic-skirt-04');
  assert.equal(previews.at(-1).wardrobeTrial.set,'gothic-04','changing skirts keeps the selected corset');
  await click('[data-wardrobe-back]');
  await click('[data-category=headwear]');
  await click('[data-wardrobe-item="remove-bonnet-bow"]');
  assert.deepEqual(previews.at(-1).removedClothing,['bonnet-bow']);
  await click('[data-wardrobe-item="remove-hat"]');
  assert.deepEqual(previews.at(-1).removedClothing,['bonnet-bow','hat']);
  await click('[data-wardrobe-item="remove-hat"]');
  assert.deepEqual(previews.at(-1).removedClothing,['bonnet-bow'],'restoring the bonnet keeps the bow off');
  await click('[data-wardrobe-item="remove-bonnet-bow"]');
  assert.equal(previews.at(-1).removedClothing,undefined);
  await showTab('emotes');
  assert.equal(previews.at(-1).wardrobeTrial.set,'gothic-04','the try-on carries into Emotes');
  assert(await beforeClose.current());
  assert.equal(requests.length,0,'trying the layered vest does not send a profile save');
  await showTab('appearance');
  await click('[data-category=corsets]');
  await click('[data-wardrobe-item="gothic-04"]');
  await click('[data-remove-try-on]');
  assert.equal(previews.at(-1).wardrobeTrial,undefined);
  assert.equal(previews.at(-1).garments.skirt,'gothic-skirt-04','removing the corset keeps the separate skirt');
  assert.equal(previews.at(-1).garments.top,'top-02');
  await click('[data-wardrobe-back]');
  await click('[data-category=outfits]');
  await click('[data-wardrobe-item=gothic-03]');
  assert.deepEqual(previews.at(-1).wardrobe,{set:'gothic-03',shirt:'none',waist:'over'},'Ruffled equips the reviewed over-skirt fit by default');
  await layer('Wide over skirt');
  assert.equal(previews.at(-1).wardrobeEase,2,'complete outfits can compare wider hems');
  await layer('Tucked into skirt');
  await click('[data-wardrobe-item=gothic-03]');
  assert.equal(previews.at(-1).wardrobe.waist,'tucked','reselecting Ruffled preserves the active fit');
  await click('[data-wardrobe-item=gothic-02]');
  assert.deepEqual(previews.at(-1).wardrobe,{set:'gothic-02',shirt:'none',waist:'over'},'Sweetheart equips the preferred over-skirt fit');
  await click('[data-wardrobe-item=gothic-05]');
  assert.deepEqual(previews.at(-1).wardrobe,{set:'gothic-05',shirt:'none',waist:'tucked'},'High Collar equips the preferred tucked fit');
  assert.equal(document.querySelector('[aria-label="Shirt layer"]'),null);
  assert.equal(document.querySelector('[data-dressing-piece="shirt"]'),null);
  assert.equal(previews.at(-1).prop,'shop-bag');assert.equal(previews.at(-1).identity,'nonbinary');
  // Flush only the latest draft, as closing the tab does in the actual menu.
  let pending;
  await act(async()=>{pending=beforeClose.current();});
  assert.equal(requests.length,1);assert.equal(requests[0].character.wardrobe.set,'gothic-05');
  assert.equal(requests[0].character.wardrobeTrial,undefined);
  assert.equal(requests[0].character.wardrobeEase,undefined);
  assert.equal(requests[0].character.removedClothing,undefined);
  await act(async()=>{client.receiveSocialResult({request_id:requests[0].request_id,ok:true,data:{character:requests[0].character}});await pending;});
  assert.deepEqual(social.getState().view.profile.progression.character.wardrobe,{set:'gothic-05',shirt:'none',waist:'tucked'});
  await act(async()=>{
    const {view}=social.getState();
    social.setState({view:{...view,profile:{...view.profile,progression:{
      ...view.profile.progression,character_outfits:{Village:DEFAULT_CHARACTER},
    }}}});
  });
  await click('[data-wardrobe-back]');
  await click('[data-category=saved]');
  await click('[aria-label="Try on Village"]');
  assert.equal(previews.at(-1).wardrobe,undefined,'an unlayered saved look also previews');
  await act(async()=>{
    const button=[...document.querySelectorAll('button')].find(item=>item.textContent==='Return to equipped');
    assert(button);
    button.click();
  });
  assert.equal(previews.at(-1).wardrobe.set,'gothic-05');
  assert(await beforeClose.current());
  assert.equal(requests.length,1,'opening and leaving a saved preview do not save an equipped character');
 }finally{
  if(root)await act(async()=>root.unmount());await vite?.close();dom.window.close();
  for(const[k,d]of original){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}
 }
});
