import test from 'node:test';
import assert from 'node:assert/strict';
import {HeroSaveQueue} from '../src/game/heroes/HeroSaveQueue.ts';
import {useHeroLoadouts,FACTORY_APPEARANCE} from '../src/vehicles/cosmetics/heroLoadouts.ts';
import {useSocialStore} from '../src/store/social/socialStore.ts';
const job=(vehicle,body,makeDefault=false)=>({hero:vehicle,vehicle,appearance:{...FACTORY_APPEARANCE,body},makeDefault});
test('rapid per-car edits coalesce; styles never select a main and newest main wins',async()=>{
 const sent=[];const q=new HeroSaveQueue(async j=>{sent.push(j);},()=>{},()=>{},10000);
 q.enqueue(job('brz','#ed258d'));q.enqueue(job('brz','#f4f5f7'));q.enqueue(job('camaro','#161a22'));assert(await q.flush());
 assert.deepEqual(sent.map(j=>[j.vehicle,j.appearance.body,j.makeDefault]),[['brz','#f4f5f7',false],['camaro','#161a22',false]]);
 sent.length=0;q.enqueue(job('brz','factory',true));q.enqueue(job('camaro','factory',true));q.enqueue(job('camaro','#ed258d'));assert(await q.flush());
 assert.deepEqual(sent.map(j=>[j.vehicle,j.makeDefault]),[['brz',false],['camaro',true]]);q.dispose();
});
test('a style change during an in-flight save follows it and never sends concurrently',async()=>{
 let unblock;let active=0,max=0;const sent=[];const gate=new Promise(r=>unblock=r);
 const q=new HeroSaveQueue(async j=>{active++;max=Math.max(max,active);sent.push(j.appearance.body);if(sent.length===1)await gate;active--;},()=>{},()=>{},10000);
 q.enqueue(job('brz','#ed258d'));const flush=q.flush();q.enqueue(job('brz','#f4f5f7'));unblock();assert(await flush);assert.equal(max,1);assert.deepEqual(sent,['#ed258d','#f4f5f7']);q.dispose();
});
test('failed autosaves retain the latest edit for explicit retry',async()=>{
 let fail=true;const states=[],saved=[];const q=new HeroSaveQueue(async()=>{if(fail)throw Error('Disconnected');},j=>saved.push(j),s=>states.push(s),10000);
 q.enqueue(job('brz','#f4f5f7'));assert.equal(await q.flush(),false);assert(states.includes('error'));fail=false;assert.equal(await q.flush(),true);assert.equal(saved[0].appearance.body,'#f4f5f7');q.dispose();
});
test('profile adoption clears foreign drafts and style acknowledgements preserve the main hero',()=>{
 const s=useHeroLoadouts.getState();s.adopt('alice','brz',{brz:{...FACTORY_APPEARANCE,body:'#f4f5f7'}});useHeroLoadouts.setState({draft:{vehicle:'brz',appearance:FACTORY_APPEARANCE}});
 s.save('camaro','camaro',{...FACTORY_APPEARANCE,body:'#ed258d'},false);assert.equal(useHeroLoadouts.getState().defaultHero,'brz');
 s.adopt('bob');assert.deepEqual(useHeroLoadouts.getState().loadouts,{});assert.equal(useHeroLoadouts.getState().draft,null);s.adopt(null);
});
test('a delayed profile view keeps the latest saved vehicle and still updates career data',()=>{
 const social=useSocialStore.getState();
 const view={profile:{id:'driver',name:'Driver',progression:{level:1,cosmetics_revision:0,character:null,character_presets:{},default_hero:'brz',hero_loadouts:{}}},
  players:[],teammates:[],requests:[],groups:[],worlds:[],world_invites:[],maps:[],current_world_id:null,limits:{max_active_worlds:3}};
 const painted=job('camaro','#ed258d').appearance;
 social.receive(view);
 social.acknowledgeProgression('driver',value=>value,{...view.profile.progression,cosmetics_revision:1,default_hero:'camaro',hero_loadouts:{camaro:painted}});
 social.receive({...view,profile:{...view.profile,progression:{...view.profile.progression,level:2}}});
 const current=useSocialStore.getState().view.profile.progression;
 assert.equal(current.default_hero,'camaro');
 assert.deepEqual(current.hero_loadouts.camaro,painted);
 assert.equal(current.level,2);
 social.receive({...view,profile:{...view.profile,id:'another-driver'}});
 assert.equal(useSocialStore.getState().view.profile.progression.default_hero,'brz');
 social.reset();
});
test('retrying an older failed main cannot overwrite a newer queued main choice',async()=>{
 let reject;const gate=new Promise((_,r)=>reject=r);let fail=true;const sent=[];
 const q=new HeroSaveQueue(async j=>{if(fail){await gate;}sent.push([j.hero,j.makeDefault]);},()=>{},()=>{},10000);
 q.enqueue(job('brz','factory',true));const first=q.flush();q.enqueue(job('camaro','factory',true));reject(Error('Offline'));assert.equal(await first,false);
 fail=false;assert(await q.flush());assert.deepEqual(sent,[['camaro',true],['brz',false]]);q.dispose();
});
