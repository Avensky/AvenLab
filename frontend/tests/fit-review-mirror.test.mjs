import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {Group, Mesh, BoxGeometry, Box3, Vector3, MeshPhysicalMaterial, Texture, AnimationMixer, LoopOnce} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const server=()=>createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});

test('manual fit checks stay specific to the player, waist fit, piece and pose; issues override checkmarks',async()=>{
 const data=new Map(),previous=globalThis.localStorage;globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const vite=await server();try{
  const {useFitReviewStore:store,fitReviewKey:key,fitReviewStatus:status,FIT_CHECKS}=await vite.ssrLoadModule('/src/game/characters/fitReviewStore.ts');
  const c={id:'mara-vega',outfit:'dockwear',wardrobe:{set:'gothic-04',shirt:'under',waist:'tucked'}},a=key('p1',c,'corset','013');
  assert.equal(status(store.getState().reviews[a]),'untested');
  FIT_CHECKS.forEach(check=>store.getState().check(a,check,true));assert.equal(status(store.getState().reviews[a]),'passed');
  assert.equal(key('p1',{...c,wardrobe:{...c.wardrobe,shirt:'over'}},'corset','013'),a);
  for(const b of [key('p2',c,'corset','013'),key('p1',c,'skirt','013'),key('p1',c,'corset','standing'),key('p1',{...c,wardrobe:{...c.wardrobe,waist:'over'}},'corset','013')])assert.equal(status(store.getState().reviews[b]),'untested');
  store.getState().note(a,'Strap clipping');assert.equal(status(store.getState().reviews[a]),'issue');
  await store.persist.rehydrate();assert.equal(store.getState().reviews[a].issue,'Strap clipping');
  store.getState().reset(a);assert.equal(status(store.getState().reviews[a]),'untested');
 }finally{await vite.close();if(previous)globalThis.localStorage=previous;else delete globalThis.localStorage;}
});

test('Supra painted shell is opaque while glass, lamp lenses and grille cutouts retain transparency',async()=>{
 const vite=await server();try{
  const {repairSupraHighlights:repair}=await vite.ssrLoadModule('/src/vehicles/tools/assetMaterialRepairs.ts');
  for(const name of ['Coloured_Material','SpecularTintG_Material','PaintTNR_Material','Base_Material','Carbon1_Material']){
   const source=new MeshPhysicalMaterial({transparent:true,opacity:.4,alphaTest:.4,alphaMap:new Texture(),map:new Texture(),transmission:.8,depthWrite:false});source.name=name;const owned=source.clone();repair(owned);
   assert.equal(owned.transparent,false);assert.equal(owned.opacity,1);assert.equal(owned.alphaMap,null);assert.equal(owned.alphaTest,0);assert.equal(owned.transmission,0);assert.equal(owned.depthWrite,true);assert.equal(owned.map,source.map);assert.equal(source.transparent,true);
  }
  for(const name of ['Window_Material','LightG_Material','Grille1G_Material']){const m=new MeshPhysicalMaterial({transparent:true,opacity:.5});m.name=name;repair(m);assert(m.transparent);assert.equal(m.opacity,.5);}
 }finally{await vite.close();}
});

test('mirror check picks the closest exterior mirror, builds both rigs, and returns to the original pose',async()=>{
 const vite=await server();try{
  const {nearestSideMirror,mirrorCheckPose}=await vite.ssrLoadModule('/src/game/characters/mirrorCheck.ts');
  const {GARAGE_STATIONS}=await vite.ssrLoadModule('/src/game/preview/garageStations.ts');
  const root=new Group(),geometry=new BoxGeometry(.2,.15,.1);
  for(const x of [-1,1]){const p=new Mesh(geometry);p.position.set(x,1,.2);p.name=`side-mirror-${x}`;root.add(p);}
  const bounds=new Box3(new Vector3(-1,0,-2),new Vector3(1,1.3,2));
  for(const sign of [-1,1])assert.equal(Math.sign(nearestSideMirror(root,GARAGE_STATIONS.supra,bounds,new Vector3(sign*1.4,0,-.4)).x),sign);
  assert.equal(nearestSideMirror(root,{kind:'bridge'},bounds,new Vector3()),undefined);
  const {prepareVillager}=await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
  const {buildEmoteClips}=await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
  const {createEmoteProp}=await vite.ssrLoadModule('/src/game/characters/emoteProps.ts');
  for(const gender of ['female','male']){
   const {scene}=await new GLTFLoader().parseAsync(await readFile(`tests/fixtures/villager-${gender}-rig.json`,'utf8'),'');
   const model=prepareVillager(scene,{female:gender==='female',fitted:true}),prop=createEmoteProp('lipstick');model.root.add(prop.root);
   const emote=mirrorCheckPose({across:.55,forward:.12,gaze:.4,side:1}),clip=buildEmoteClips(model.root,[emote],new Map([['lipstick',prop]]))[0];
   for(const track of clip.tracks)assert([...track.values].every(v=>typeof v==='boolean'||Number.isFinite(v)), `${gender}: ${track.name} ${[...track.values]}`);
   const rest=model.root.position.clone(),mixer=new AnimationMixer(model.root),action=mixer.clipAction(clip).setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(clip.duration*.44);
   assert(prop.root.scale.x>.99);assert(model.root.position.distanceTo(rest)>.4);
   mixer.setTime(clip.duration);assert(model.root.position.distanceTo(rest)<1e-5);assert.equal(prop.root.scale.x,0);
   mixer.stopAllAction();prop.dispose();model.dispose();
  }
 }finally{await vite.close();}
});
