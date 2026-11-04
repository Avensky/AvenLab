#!/usr/bin/env node
/** Real six-profile CTF admission/deployment. Opposing picks must remain
 * private across social, physics, config and debug channels until real start.
 * Runs one disposable server with its own profile tree; no test-only RPCs. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const binary=process.env.AVENLAB_SERVER_BIN??path.join(repo,'avenlab-server/target/debug',process.platform==='win32'?'avenlab-server.exe':'avenlab-server');
if(!fs.existsSync(binary))throw Error('Build Rust first: cargo build --manifest-path avenlab-server/Cargo.toml');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'avenlab-prematch-privacy-'));
const reservation=net.createServer();
await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const server=spawn(binary,[],{cwd:path.join(repo,'avenlab-server'),env:{...process.env,AVENLAB_BIND:`127.0.0.1:${port}`,AVENLAB_SOCIAL_PATH:path.join(directory,'social.json'),AVENLAB_ALPHA_LIMITS:'1',AVENLAB_ROLE_LIMITS:'1',AVENLAB_MAX_ACTIVE_WORLDS:'1',AVENLAB_MAX_PLAYERS:'6'},stdio:['ignore','pipe','pipe']});
let output='',phase='startup';
const peers=[],checks=[];
for(const stream of [server.stdout,server.stderr])stream.on('data',bytes=>output=(output+bytes.toString()).slice(-24000));
const started=new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error('Server startup timed out: '+output.slice(-1600))),15000);
 server.stdout.on('data',bytes=>{if(bytes.toString().includes('WebSocket listening')){clearTimeout(timer);resolve();}});
 server.once('error',error=>{clearTimeout(timer);reject(error);});server.once('exit',code=>{clearTimeout(timer);if(code)reject(Error('Server exited: '+code));});
});
class Peer{
 constructor(){
  this.serial=0;this.messages=[];this.waiters=[];this.view=null;this.latest=null;this.configs=[];this.debug=[];
  this.socket=new WebSocket(`ws://127.0.0.1:${port}`);
  this.socket.addEventListener('message',event=>{
   const message=JSON.parse(event.data);this.messages.push(message);if(this.messages.length>240)this.messages.shift();
   if(message.type==='social_state')this.view=message.data;
   if(message.type==='snapshot')this.latest=message;
   if(message.type==='vehicle_config')this.configs.push(message);
   if(message.type==='debug')this.debug.push(message);
   for(const waiter of [...this.waiters])if(waiter.test(message)){clearTimeout(waiter.timer);this.waiters.splice(this.waiters.indexOf(waiter),1);waiter.resolve(message);}
  });
 }
 wait(test,fresh=false){
  if(!fresh){const found=this.messages.findLast(test);if(found)return Promise.resolve(found);}
  return new Promise((resolve,reject)=>{
   const waiter={test,resolve,timer:setTimeout(()=>{this.waiters.splice(this.waiters.indexOf(waiter),1);reject(Error('Timed out in '+phase+'; alpha='+JSON.stringify(this.view?.alpha)+'; server='+output.slice(-1800)));},22000)};this.waiters.push(waiter);
  });
 }
 async ready(name){const welcome=await this.wait(message=>message.type==='welcome');this.player=welcome.player_id;if(name)this.identity=await this.command('identify',{name});return this;}
 async command(action,fields={}){const request_id=`privacy-${++this.serial}`,reply=this.wait(message=>message.type==='social_result'&&message.request_id===request_id,true);this.socket.send(JSON.stringify({type:'social_request',action,request_id,...fields}));const result=await reply;assert(result.ok,result.message);return result.data;}
 async deploy(){const reply=this.wait(message=>message.type==='spawn_ready'||message.type==='spawn_error',true);this.socket.send(JSON.stringify({type:'spawn_request',map:'streaming_endless_city',vehicle:this.vehicle,mode:'quickplay'}));const result=await reply;assert.equal(result.type,'spawn_ready',result.message);}
 async disconnect(){if(this.socket.readyState===WebSocket.CLOSED)return;const closed=new Promise(resolve=>this.socket.addEventListener('close',resolve,{once:true}));this.socket.close();await closed;}
 close(){for(const waiter of this.waiters)clearTimeout(waiter.timer);this.waiters=[];this.socket.close();}
}
const roster=view=>view.alpha.roster.filter(card=>card.world_id===view.alpha.active.world_id);
try{
 await started;
 phase='six authenticated modern Quickplay 3v3 admissions';
 let world;
 for(let index=0;index<6;index++){
  const peer=await new Peer().ready(`Privacy driver ${index}`);peers.push(peer);
  const joined=await peer.command('mode_join',{mode:'quickplay',team_size:3,hero:''});
  assert.equal(joined.status,'joined');world??=joined.world_id;assert.equal(joined.world_id,world);
  const active=(await peer.wait(message=>message.type==='social_state'&&message.data.alpha?.active?.world_id===world)).data.alpha.active;
  peer.team=active.team;
 }
 assert.equal(new Set(peers.map(peer=>peer.identity.profile_id)).size,6);
 const teams={red:peers.filter(peer=>peer.team==='red'),blue:peers.filter(peer=>peer.team==='blue')};
 for(const team of Object.values(teams)){
  assert.equal(team.length,3);
  for(let index=0;index<team.length;index++){const peer=team[index];peer.hero=['tank','brz','cx30'][index];peer.vehicle=peer.hero;await peer.command('hero_select',{hero:peer.hero});}
 }
 checks.push('Six authenticated profiles select complete independent Tank/DPS/Mechanic teams in a real Quickplay 3v3 waiting room');

 phase='viewer-specific social pick privacy';
 let round;
 for(const peer of peers){
  const state=(await peer.wait(message=>message.type==='social_state'&&message.data.alpha?.active&&[null,'waiting'].includes(message.data.alpha.active.match_phase)&&roster(message.data).length===6&&roster(message.data).filter(card=>card.team===peer.team).every(card=>card.hero&&card.hero_hidden===false))).data;
  // The scheduler may not have configured an empty room yet. Missing phase is
  // fail-closed; once configured, every viewer must agree on its exact round.
  if(state.alpha.active.match_id!==null){round??=state.alpha.active.match_id;assert.equal(state.alpha.active.match_id,round);assert.equal(typeof round,'string');assert(round.length>0);}
  for(const card of roster(state)){
   if(card.team===peer.team){assert.equal(card.hero_hidden,false);assert(card.hero);assert(card.showcase_hero);assert(card.appearance&&typeof card.appearance==='object');}
   else{assert.equal(card.hero_hidden,true);assert.equal(card.hero,'');assert.equal(card.showcase_hero,'');assert.equal(card.appearance,null);assert.equal(typeof card.name,'string');}
  }
 }
 checks.push('Every viewer keeps allied picks/styles while opposing hero, showcase and equipped appearance are redacted before the exact round starts');

 phase='five real deployments remain waiting';
 for(const peer of peers.slice(0,5))await peer.deploy();
 for(const peer of peers){
  const expected=peers.slice(0,5).filter(player=>player.team===peer.team).length;
  const frame=await peer.wait(message=>message.type==='snapshot'&&message.world_id===world&&message.data.match_state?.phase==='waiting'&&message.data.entities.length===expected);
  round??=frame.data.match_state.match_id;assert.equal(typeof round,'string');assert(round.length>0);
  assert.equal(frame.data.match_state.match_id,round);
  const active=(await peer.wait(message=>message.type==='social_state'&&message.data.alpha?.active?.match_phase==='waiting')).data.alpha.active;
  assert.equal(active.match_id,round);
  assert(frame.data.entities.every(entity=>entity.team===peer.team),'opposing model/collider/weapon data must not reach the waiting client');
  assert(frame.data.entities.every(entity=>entity.vehicle_id===peers.find(player=>player.player===entity.id).vehicle));
 }
 checks.push('Five actual vehicle deployments do not start the scored round; waiting snapshots expose only each viewer’s own team');

 phase='deployed warm-up hero change stays private';
 const changed=teams.red[1],opposing=teams.blue[0],opposingConfigs=opposing.configs.length;
 await changed.command('hero_select',{hero:'ae86'});changed.hero='ae86';changed.vehicle='ae86';
 const changeReply=changed.wait(message=>message.type==='vehicle_changed'&&message.request_id==='privacy-change',true);
 changed.socket.send(JSON.stringify({type:'change_vehicle_request',request_id:'privacy-change',vehicle:'ae86'}));
 await changeReply;
 const changedFrame=await changed.wait(message=>message.type==='snapshot'&&message.data.match_state?.phase==='waiting'&&message.data.entities.some(entity=>entity.id===changed.player&&entity.vehicle_id==='ae86'));
 await opposing.wait(message=>message.type==='snapshot'&&message.data.match_state?.phase==='waiting'&&message.data.tick>changedFrame.data.tick+2,true);
 assert(!opposing.configs.slice(opposingConfigs).some(message=>message.data.player_id===changed.player),'a deployed hero change cannot leak through a setup broadcast');
 const changedCard=roster(opposing.view).find(card=>card.id===changed.identity.profile_id);
 assert.equal(changedCard.hero_hidden,true);assert.equal(changedCard.hero,'');assert.equal(changedCard.showcase_hero,'');assert.equal(changedCard.appearance,null);
 checks.push('A deployed DPS switches through hero_select and normal change_vehicle_request while opponents receive no chosen hero, paint or vehicle setup');

 phase='warm-up reconnect filters replayed configuration';
 const original=peers.at(-1),identity=original.identity;
 await original.disconnect();
 const restored=await new Peer().ready();
 restored.identity=await restored.command('identify',{name:'Privacy restored',token:identity.token});
 assert.equal(restored.identity.profile_id,identity.profile_id);restored.team=original.team;restored.hero=original.hero;restored.vehicle=original.vehicle;
 peers[peers.length-1]=restored;
 const restoredState=(await restored.wait(message=>message.type==='social_state'&&message.data.alpha?.active?.world_id===world&&message.data.alpha.active.hero===restored.hero)).data;
 assert.equal(restoredState.alpha.active.match_phase,'waiting');assert.equal(restoredState.alpha.active.match_id,round);assert.equal(restoredState.alpha.active.team,restored.team);
 await restored.wait(message=>message.type==='snapshot'&&message.data.match_state?.phase==='waiting'&&message.data.entities.length>=2);
 assert(restored.configs.length>=2,'reconnect should replay the deployed allied setup');
 for(const config of restored.configs){const source=peers.find(peer=>peer.player===config.data.player_id);assert(source);assert.equal(source.team,restored.team,'existing-config replay cannot disclose an opponent');}
 for(const card of roster(restoredState).filter(card=>card.team!==restored.team)){assert.equal(card.hero_hidden,true);assert.equal(card.hero,'');assert.equal(card.appearance,null);}
 checks.push('Token reconnect restores the exact waiting seat and hero while existing-config replay and roster still hide all opposing picks');

 phase='warm-up config and debug channels';
 for(const peer of peers){
  for(const config of peer.configs){const source=peers.find(player=>player.player===config.data.player_id);assert(source);assert.equal(source.team,peer.team,'config tuning must not expose an opposing chassis');}
 }
 const observer=peers[0],tick=observer.latest.data.tick;
 observer.socket.send(JSON.stringify({type:'input',seq:1,dt:1/60,throttle:0,steer:0,brake:1,handbrake:0,vehicleMask:1,playerMask:0,debug_mask:1}));
 await observer.wait(message=>message.type==='snapshot'&&message.data.match_state?.phase==='waiting'&&message.data.tick>tick+5&&message.data.entities.some(entity=>entity.id===observer.player&&entity.last_input_seq===1),true);
 assert.equal(observer.debug.length,0,'prestart physics diagnostics cannot reveal enemy geometry');
 checks.push('Opposing vehicle_config messages are withheld during selection and a real debug request cannot expose hidden warm-up geometry');

 phase='last deployment triggers authoritative start and automatic reveal';
 const configOffsets=peers.map(peer=>peer.configs.length);
 await peers.at(-1).deploy();
 for(const peer of peers){
  const state=(await peer.wait(message=>message.type==='social_state'&&message.data.alpha?.active?.match_phase==='running')).data;
  assert.equal(state.alpha.active.world_id,world);assert.equal(state.alpha.active.match_id,round);assert.equal(state.alpha.active.team_size,3);
  for(const card of roster(state)){
   const player=peers.find(player=>player.identity.profile_id===card.id);assert(player);assert.equal(card.hero_hidden,false);assert.equal(card.hero,player.hero);assert.equal(card.showcase_hero,player.hero);assert(card.appearance&&typeof card.appearance==='object');
  }
 }
 checks.push('The sixth deployment starts the same scored round and automatically reveals every opposing pick/style through fresh social state, without manual refresh');

 phase='running physics and setup reveal';
 for(let index=0;index<peers.length;index++){
  const peer=peers[index],frame=await peer.wait(message=>message.type==='snapshot'&&message.data.match_state?.phase==='running'&&message.data.entities.length===6);
  assert.equal(frame.data.match_state.match_id,round);assert.equal(frame.data.match_state.training,false);
  for(const entity of frame.data.entities){const player=peers.find(player=>player.player===entity.id);assert(player);assert.equal(entity.vehicle_id,player.vehicle);}
  const observed=new Set(peer.configs.slice(configOffsets[index]).map(message=>message.data.player_id));
  assert.equal(observed.size,6,'start sends the previously private chassis setup to every viewer');
 }
 checks.push('Running snapshots reveal all six authoritative vehicles and every client receives the previously withheld chassis configuration at start');
 console.log(JSON.stringify({checks,failures:0},null,2));
}finally{
 for(const peer of peers)peer.close();server.kill();
 await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve);});
 fs.rmSync(directory,{recursive:true,force:true});
}
