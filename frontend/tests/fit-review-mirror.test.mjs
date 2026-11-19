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
  const c={id:'mara-vega',outfit:'dockwear',wardrobe:{set:'gothic-05',shirt:'under',waist:'tucked'}},a=key('p1',c,'corset','013');
  assert.equal(status(store.getState().reviews[a]),'untested');
  FIT_CHECKS.forEach(check=>store.getState().check(a,check,true));assert.equal(status(store.getState().reviews[a]),'passed');
  assert.equal(key('p1',{...c,wardrobe:{...c.wardrobe,shirt:'over'}},'corset','013'),a);
  const trial={...c,garments:{skirt:'gothic-skirt-04',top:'top-02'}};
  const trialKey=key('p1',trial,'corset','013');
  assert.notEqual(trialKey,a);
  assert.equal(key('p1',{...trial,garments:{top:'top-02',skirt:'gothic-skirt-04'}},'corset','013'),trialKey);
  const top03={...trial,garments:{...trial.garments,top:'top-03'}};
  assert.equal(JSON.parse(key('p1',top03,'shirt')).at(-1),'top-03-2');
  assert(!JSON.parse(key('p1',{...top03,removedClothing:['top']},'shirt')).includes('top-03-2'));
  const shortSkirt={...c,garments:{skirt:'skirt-03'}};
  assert(JSON.parse(key('p1',shortSkirt,'skirt')).includes('short-skirt-drape-2'));
  assert(!JSON.parse(key('p1',{...shortSkirt,removedClothing:['skirt']},'skirt')).includes('short-skirt-drape-2'));
  assert(!JSON.parse(trialKey).includes('short-skirt-drape-2'));
  assert(JSON.parse(key('p1', shortSkirt, 'skirt')).includes('short-skirt-fabric-1'));
  assert(!JSON.parse(key('p1', { ...shortSkirt, removedClothing: ['skirt'] }, 'skirt')).includes('short-skirt-fabric-1'));
  const revisedWaist = choice => JSON.parse(key('p1', choice, 'skirt')).includes('gothic-skirt-waist-3-subtle');
  assert(revisedWaist(c), 'the complete outfit uses its revised skirt');
  assert(revisedWaist(trial), 'a separate Gothic skirt uses its revised fit');
  assert(!revisedWaist(shortSkirt), 'a short skirt replaces the Gothic skirt');
  assert(!revisedWaist({ ...trial, removedClothing: ['outer-skirt'] }));
  assert(!revisedWaist({ ...c, garments: { dress: 'dress-01' } }));
  assert(!revisedWaist({ ...c, wardrobe: undefined, wardrobeTrial: c.wardrobe }), 'a separate corset leaves the stock skirt in place');
  const highWaist = choice => JSON.parse(key('p1', choice, 'skirt')).includes('gothic-skirt-02-05-high-waist-1');
  assert(highWaist(c), 'the high-waisted matched skirt gets a fresh review');
  for (const number of ['01', '02', '03', '04', '05']) {
    assert.equal(highWaist({ ...c, garments: { skirt: 'gothic-skirt-' + number } }), ['02', '05'].includes(number),
      'only the two corrected high-waisted skirts invalidate their earlier review');
  }
  assert(!highWaist({ ...c, removedClothing: ['skirt'] }));
  const repairedLayers = choice => JSON.parse(key('p1', choice, 'skirt')).includes('gothic-skirt-covered-layers-1');
  for (const number of ['01', '02', '03', '04', '05']) {
    assert.equal(repairedLayers({ ...c, garments: { skirt: 'gothic-skirt-' + number } }), ['01', '03', '05'].includes(number),
      'the three repaired separate skirts need a fresh layer review');
    assert.equal(repairedLayers({ ...c, wardrobe: { ...c.wardrobe, set: 'gothic-' + number } }), number === '01',
      'only the changed bundled Handkerchief skirt needs a fresh layer review');
  }
  assert(!repairedLayers({ ...c, garments: { skirt: 'gothic-skirt-03' }, removedClothing: ['skirt'] }));
  assert(!repairedLayers({ ...c, wardrobe: { ...c.wardrobe, set: 'gothic-01' }, garments: { dress: 'dress-01' } }));
  assert(JSON.parse(key('p1', { ...c, garments: { bow: 'bowtie-01' } }, 'bowtie-01:bow')).includes('neck-bow-2-settled'));
  assert(!JSON.parse(key('p1', { ...c, removedClothing: ['bow'] }, 'bowtie-01:bow')).includes('neck-bow-2-settled'));
  const tuckedShorts = choice => JSON.parse(key('p1', choice, 'skirt')).includes('short-skirt-tuck-1-no-expansion');
  assert(tuckedShorts(shortSkirt));
  assert(!tuckedShorts({ ...shortSkirt, wardrobe: { ...c.wardrobe, waist: 'over' } }));
  assert(!tuckedShorts({ ...shortSkirt, removedClothing: ['corset'] }));
  const boxer = { ...c, appearance: { briefs_style: 'boxer-briefs' } };
  for (const subject of ['briefs', 'underwear-briefs:briefs']) {
    assert(JSON.parse(key('p1', c, subject)).includes('v-cut-briefs-1'));
    assert(JSON.parse(key('p1', boxer, subject)).includes('boxer-briefs-1'));
  }
  assert.equal(key('p1', boxer, 'gothic-05:corset'), key('p1', c, 'gothic-05:corset'));
  assert(JSON.parse(key('p1', { ...c, bra: true, appearance: { bra_style: 'push-up' } }, 'underwear-bra:bra')).includes('push-up-cups-2'));
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
  const {fitMirrorCheck,nearestSideMirror,makeupPreviewEmote,MAKEUP_EMOTES}=await vite.ssrLoadModule('/src/game/characters/mirrorCheck.ts');
  const {GARAGE_STATIONS}=await vite.ssrLoadModule('/src/game/preview/garageStations.ts');
  const root=new Group(),geometry=new BoxGeometry(.2,.15,.1);
  for(const x of [-1,1]){const p=new Mesh(geometry);p.position.set(x,1,.2);p.name=`side-mirror-${x}`;root.add(p);}
  const bounds=new Box3(new Vector3(-1,0,-2),new Vector3(1,1.3,2));
  for(const side of [-1,1]){
   const from=new Vector3(side*1.4,0,-.8);
   const mirror=nearestSideMirror(root,GARAGE_STATIONS.supra,bounds,from);
   assert.equal(Math.sign(mirror.x),side);
   const fit=fitMirrorCheck(from,mirror,side);
   const stand=from.clone().add(new Vector3(0,0,-side*fit.across));
   const facing=new Vector3(0,0,1).applyAxisAngle(new Vector3(0,1,0),side*Math.PI/2+fit.turn);
   assert(facing.dot(mirror.clone().sub(stand).setY(0).normalize())>.999);
  }
  assert.equal(nearestSideMirror(root,{kind:'bridge'},bounds,new Vector3()),undefined);
  const {prepareVillager}=await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
  const {buildEmoteClips}=await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
  const {VILLAGER_EYES}=await vite.ssrLoadModule('/src/game/characters/villagerFace.ts');
  const {createEmoteProp,EMOTE_PROP_GRIPS}=await vite.ssrLoadModule('/src/game/characters/emoteProps.ts');
  const fit={across:.55,forward:.12,gaze:.4,turn:-2.4};
  for(const gender of ['female','male']){
   const {scene}=await new GLTFLoader().parseAsync(await readFile(`tests/fixtures/villager-${gender}-rig.json`,'utf8'),'');
   const model=prepareVillager(scene,{female:gender==='female',fitted:true});
   const rest=model.root.position.clone();
   for(const mode of MAKEUP_EMOTES) for(const mirror of [false,true]){
    const emote=makeupPreviewEmote(mirror?mode.mirrorId:mode.id,mirror?fit:undefined);
    const prop=emote.prop && createEmoteProp(emote.prop);
    if(prop)model.root.add(prop.root);
    const head=model.root.getObjectByName('head'),face=VILLAGER_EYES[gender];
    const lip=emote.prop==='lipstick';
    const landmark=head.worldToLocal(model.root.localToWorld(new Vector3(0,lip?face.lip:face.y+.006,face.z+(lip?.019:.010))));
    const clip=buildEmoteClips(model.root,[emote],prop?new Map([[emote.prop,prop]]):undefined)[0];
    for(const track of clip.tracks)assert([...track.values].every(v=>typeof v==='boolean'||Number.isFinite(v)), `${gender}: ${track.name}`);
    const mixer=new AnimationMixer(model.root),action=mixer.clipAction(clip).setLoop(LoopOnce,1);
    action.clampWhenFinished=true;action.play();
    const working=emote.keys.filter(([,pose])=>pose.prop).slice(1,-1);
    if(prop) for(const [index,[time]] of working.entries()){
     mixer.setTime(clip.duration*time);
     assert(prop.root.visible && prop.root.scale.x>.99);
     const wrist=model.root.getObjectByName('hand_r').getWorldPosition(new Vector3());
     const grip=prop.root.localToWorld(new Vector3(...EMOTE_PROP_GRIPS[emote.prop][1].wrist));
     assert(wrist.distanceTo(grip)<.040,`${gender} ${emote.id}: the applicator stays in the hand (${wrist.distanceTo(grip)})`);
     if(lip || index!==2){
      const tip=head.worldToLocal(prop.root.localToWorld(new Vector3(0,lip?.0225:.060,0)));
      assert(tip.distanceTo(landmark)<.052,`${gender} ${emote.id}: the tip tracks the intended face area`);
     }
    }
    mixer.setTime(clip.duration*.62);
    assert.equal(model.root.position.distanceTo(rest)>.4,mirror,'only the side-mirror version walks');
    mixer.setTime(clip.duration);
    assert(model.root.position.distanceTo(rest)<1e-5);
    if(prop)assert.equal(prop.root.scale.x,0);
    mixer.stopAllAction();prop?.dispose();
   }
   model.dispose();
  }
 }finally{await vite.close();}
});
