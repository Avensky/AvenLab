#!/usr/bin/env node
/** Real 3v3 admission/deployment/reconnect over WebSockets. This disposable
 * server and profile tree never connect to a running game or alter its data. */
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
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'avenlab-3v3-'));
const reserve=net.createServer();
await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
const port=reserve.address().port;
await new Promise(resolve=>reserve.close(resolve));
const server=spawn(binary,[],{cwd:path.join(repo,'avenlab-server'),env:{...process.env,AVENLAB_BIND:`127.0.0.1:${port}`,AVENLAB_SOCIAL_PATH:path.join(directory,'social.json'),AVENLAB_ALPHA_LIMITS:'1',AVENLAB_ROLE_LIMITS:'1',AVENLAB_MAX_ACTIVE_WORLDS:'1',AVENLAB_MAX_PLAYERS:'12'},stdio:['ignore','pipe','pipe']});
let output='',phase='startup';
for(const stream of [server.stdout,server.stderr])stream.on('data',bytes=>output=(output+bytes.toString()).slice(-20000));
const started=new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error('Server startup timed out. '+output.slice(-1000))),15000);
 server.stdout.on('data',bytes=>{if(bytes.toString().includes('WebSocket listening')){clearTimeout(timer);resolve();}});
 server.once('error',error=>{clearTimeout(timer);reject(error);});
 server.once('exit',code=>{clearTimeout(timer);if(code)reject(Error('Server exited: '+code));});
});
class Peer{
 constructor(){
  this.serial=0;this.messages=[];this.waiters=[];this.view=null;this.snapshot=null;
  this.socket=new WebSocket(`ws://127.0.0.1:${port}`);
  this.socket.addEventListener('message',event=>{
   const message=JSON.parse(event.data);this.messages.push(message);if(this.messages.length>150)this.messages.shift();
   if(message.type==='social_state')this.view=message.data;
   if(message.type==='snapshot')this.snapshot=message.data;
   for(const waiter of [...this.waiters])if(waiter.test(message)){clearTimeout(waiter.timer);this.waiters.splice(this.waiters.indexOf(waiter),1);waiter.resolve(message);}
  });
 }
 wait(test,fresh=false){
  if(!fresh){const previous=this.messages.findLast(test);if(previous)return Promise.resolve(previous);}
  return new Promise((resolve,reject)=>{
   const waiter={test,resolve,timer:setTimeout(()=>{this.waiters.splice(this.waiters.indexOf(waiter),1);reject(Error('Expected packet not received during '+phase+'. '+output.slice(-1600)));},18000)};this.waiters.push(waiter);
  });
 }
 async ready(name){const welcome=await this.wait(message=>message.type==='welcome');this.player=welcome.player_id;if(name)this.identity=await this.command('identify',{name});return this;}
 async request(action,fields={}){const request_id=`3v3-${++this.serial}`,response=this.wait(message=>message.type==='social_result'&&message.request_id===request_id,true);this.socket.send(JSON.stringify({type:'social_request',action,request_id,...fields}));return response;}
 async command(action,fields={}){const response=await this.request(action,fields);assert(response.ok,response.message);return response.data;}
 async deploy(vehicle){const response=this.wait(message=>message.type==='spawn_ready'||message.type==='spawn_error',true);this.socket.send(JSON.stringify({type:'spawn_request',map:'streaming_endless_city',vehicle,mode:'skirmish'}));const result=await response;assert.equal(result.type,'spawn_ready',result.message);return result;}
 async disconnect(){if(this.socket.readyState===WebSocket.CLOSED)return;const closed=new Promise(resolve=>this.socket.addEventListener('close',resolve,{once:true}));this.socket.close();await closed;}
 close(){for(const waiter of this.waiters)clearTimeout(waiter.timer);this.waiters=[];this.socket.close();}
}
const peers=[],checks=[];
try{
 await started;
 const seated=[];let world;
 phase='six distinct profile admissions';
 for(let index=0;index<6;index++){
  const peer=await new Peer().ready(`3v3 driver ${index}`);peers.push(peer);seated.push(peer);
  const joined=await peer.command('mode_join',{mode:'skirmish',map:'road_precision',hero:''});
  assert.equal(joined.status,'joined');world??=joined.world_id;assert.equal(joined.world_id,world);
 }
 assert.equal(new Set(seated.map(peer=>peer.identity.profile_id)).size,6);
 const state=(await seated[0].wait(message=>message.type==='social_state'&&message.data.alpha?.active?.mode==='skirmish'&&message.data.alpha.roster.length===6)).data;
 assert.equal(state.alpha.active.team_size,3);assert.equal(state.alpha.active.capacity,6);
 assert.deepEqual(state.alpha.active.role_caps,{tank:1,dps:1,support:1});
 assert.deepEqual(state.alpha.active.role_minimums,{tank:1,dps:1,support:1});
 for(const team of ['red','blue'])assert.equal(state.alpha.roster.filter(row=>row.team===team).length,3);
 assert.equal(state.worlds.find(value=>value.id===world).max_players,6);
 checks.push('Six authenticated profiles share one 3v3 world with three balanced seats per team and authoritative 1/1/1 roles');

 phase='seventh seat and separate 5v5 mode queue';
 const seventh=await new Peer().ready('Seventh 3v3 driver');peers.push(seventh);
 assert.equal((await seventh.command('mode_join',{mode:'skirmish',hero:''})).status,'queued');
 const quickplay=await new Peer().ready('5v5 driver');peers.push(quickplay);
 assert.equal((await quickplay.command('mode_join',{mode:'quickplay',hero:''})).status,'queued');
 const queue=(await seventh.wait(message=>message.type==='social_state'&&message.data.alpha?.queue?.mode==='skirmish')).data.alpha.queue;
 assert.equal(queue.team_size,3);assert.equal(queue.capacity,6);
 assert(!quickplay.view?.alpha?.active);
 checks.push('With the configured one-world budget, a seventh player queues and Quickplay cannot mix into the existing 3v3 world or allocate another active game');

 phase='role selection';
 const byTeam={red:[],blue:[]};
 for(const peer of seated){const card=state.alpha.roster.find(row=>row.id===peer.identity.profile_id);peer.team=card.team;byTeam[card.team].push(peer);}
 for(const team of ['red','blue']){
  const tankHero=team==='red'?'tank':'sierra';
  const heroes=[tankHero,'mini',team==='red'?'mechanic':'logistics'];
  const vehicles=[tankHero,'mini',team==='red'?'fortuner':'landcruiser'];
  await byTeam[team][0].command('hero_select',{hero:tankHero});
  const duplicate=await byTeam[team][1].request('hero_select',{hero:'tank'});assert.equal(duplicate.ok,false);
  for(let index=1;index<3;index++)await byTeam[team][index].command('hero_select',{hero:heroes[index]});
  for(let index=0;index<3;index++)byTeam[team][index].vehicle=vehicles[index];
 }
 checks.push('Each side selects a Tank and Mini DPS, with Fortuner Mechanic on red and Land Cruiser Logistics on blue; a second tank is rejected without stealing a locked role');

 phase='five vehicles remain in warmup';
 for(const peer of seated.slice(0,5))await peer.deploy(peer.vehicle);
 const visibleWaiting=seated.slice(0,5).filter(peer=>peer.team===seated[0].team).length;
 const waiting=(await seated[0].wait(message=>message.type==='snapshot'&&message.data.entities.length===visibleWaiting&&message.data.match_state?.phase==='waiting')).data;
 assert(waiting.entities.every(entity=>entity.team===seated[0].team),'waiting opponents retain their mystery picks');
 assert.equal(waiting.match_state.mode,'skirmish');assert.equal(waiting.match_state.training,false);
 checks.push('Five deployed vehicles cannot start a scored 3v3 round');
 phase='sixth vehicle starts the round';
 await seated[5].deploy(seated[5].vehicle);
 const running=(await seated[0].wait(message=>message.type==='snapshot'&&message.data.entities.length===6&&message.data.match_state?.phase==='running')).data;
 assert.equal(running.match_state.mode,'skirmish');assert.equal(running.match_state.training,false);
 assert.equal(running.match_state.captures_to_win,3);
 const roomMap=m=>m.type==='map_snapshot' && m.world_id===world && m.data?.sky;
 const maps=await Promise.all(seated.map(peer=>peer.wait(roomMap)));
 const roomSky=maps[0].data.sky;
 assert(['starry_night','foggy_day'].includes(roomSky));
 assert(maps.every(m=>m.data.sky===roomSky && m.data.map_id===maps[0].data.map_id));
 checks.push('Both teams received the same map and sky preset from their room');
 for(const team of ['red','blue'])assert.equal(running.entities.filter(entity=>entity.team===team).length,3);
 const pickup=running.entities.find(entity=>entity.vehicle_id==='sierra');
 assert(pickup);assert.equal(pickup.health.max_hp,900);
 assert(running.entities.some(entity=>entity.vehicle_id==='fortuner'));
 assert(running.entities.some(entity=>entity.vehicle_id==='landcruiser'));
 for(const team of ['red','blue']){
  const home=running.match_state.flags.find(flag=>flag.team===team).base;
  const cars=running.entities.filter(entity=>entity.team===team);
  assert.equal(cars.length,3);
  assert(cars.every(car=>Math.hypot(car.position[0]-home[0],car.position[2]-home[2])<40),'each car starts near its own home flag');
  assert(cars.every((car,index)=>cars.slice(index+1).every(other=>Math.hypot(car.position[0]-other.position[0],car.position[2]-other.position[2])>6)),'separate home pads');
 }
 checks.push('The sixth real deployment starts CTF and the first running snapshot shows each team on separate home pads');

 phase='server-owned passive ultimate and forged input';
 const initialCharge=running.entities.find(entity=>entity.id===seated[0].player).ultimate_fraction;
 assert(initialCharge>0&&initialCharge<0.02,'idle alive vehicles earn only slow passive charge');
 seated[0].socket.send(JSON.stringify({type:'input',seq:1,dt:1000000,throttle:0,steer:0,brake:1,handbrake:0,vehicleMask:1,playerMask:0,ultimate_fraction:1,ultimate:1,health:{ultimate_fraction:1}}));
 const next=(await seated[0].wait(message=>message.type==='snapshot'&&message.data.tick>running.tick+3,true)).data;
 const charge=next.entities.find(entity=>entity.id===seated[0].player).ultimate_fraction;
 assert(charge>initialCharge&&charge-initialCharge<0.02,'a forged charge or huge packet dt cannot fill ultimate');
 checks.push('Idle living vehicles gain slow server-owned ultimate charge while forged charge and elapsed-time input fields are ignored');


 phase='mixed packed and legacy driving inputs';
 const vectors=JSON.parse(fs.readFileSync(path.join(repo,'avenlab-server/tests/fixtures/packed-input-v1.json'),'utf8'));
 const packed=Buffer.from(vectors[0].hex,'hex');
 seated[0].socket.send(packed);
 seated[1].socket.send(JSON.stringify({...vectors[0].input,seq:425}));
 const acknowledges=message=>message.type==='snapshot' &&
   message.data.entities.some(e=>e.id===seated[0].player&&e.last_input_seq===65538) &&
   message.data.entities.some(e=>e.id===seated[1].player&&e.last_input_seq===425);
 await Promise.all([seated[0].wait(acknowledges,true),seated[1].wait(acknowledges,true)]);
 const malformed=Buffer.from(packed);malformed[2]=99;malformed.writeUInt32LE(65539,4);seated[0].socket.send(malformed);
 const check=await seated[1].wait(acknowledges,true);
 assert.equal(check.data.entities.find(e=>e.id===seated[0].player).last_input_seq,65538);
 checks.push('Packed and JSON drivers share sequence acknowledgements in the same 3v3 match');
 phase='disconnect preserves the sixth seat';
 const original=seated[0],identity=original.identity,team=original.team;
 await original.disconnect();
 await seated[1].wait(message=>message.type==='social_state'&&message.data.alpha?.roster.some(row=>row.id===identity.profile_id&&row.reconnecting));
 await seventh.command('refresh');
 assert(!seventh.view?.alpha?.active);assert.equal(seventh.view?.alpha?.queue?.mode,'skirmish');
 checks.push('Disconnect retains the 3v3 seat and locked hero rather than admitting the queued seventh player');
 phase='authenticated token reconnect';
 const resumed=await new Peer().ready();peers.push(resumed);
 const restored=await resumed.command('identify',{name:'3v3 driver 0',token:identity.token});assert.equal(restored.profile_id,identity.profile_id);
 const current=(await resumed.wait(message=>message.type==='social_state'&&message.data.alpha?.active?.mode==='skirmish')).data;
 assert.equal(current.alpha.active.world_id,world);assert.equal(current.alpha.active.team,team);assert.equal(current.alpha.active.hero,original.vehicle);assert.equal(current.alpha.active.team_size,3);
 assert.equal(current.alpha.roster.filter(row=>row.id===identity.profile_id).length,1);
 await resumed.deploy(original.vehicle);
 assert.equal((await resumed.wait(roomMap)).data.sky,roomSky);
 await resumed.wait(message=>message.type==='snapshot'&&message.data.entities.some(entity=>entity.id===resumed.player&&entity.team===team)&&message.data.match_state?.mode==='skirmish');
 checks.push('Token reconnect restores the same 3v3 world, team and hero, with one roster card and a valid redeployed body');
 console.log(JSON.stringify({checks,failures:0},null,2));
}finally{
 for(const peer of peers)peer.close();server.kill();
 await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve);});
 fs.rmSync(directory,{recursive:true,force:true});
}
