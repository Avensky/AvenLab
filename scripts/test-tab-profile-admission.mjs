#!/usr/bin/env node
/** Real local profile/Quickplay regression. Uses an isolated server and profile
 * file; never connects to a running game or changes a player's saved identity. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const binary=process.env.AVENLAB_SERVER_BIN??path.join(repo,'avenlab-server/target/debug',process.platform==='win32'?'avenlab-server.exe':'avenlab-server');
if(!fs.existsSync(binary))throw Error('Build Rust first: cargo build --locked --manifest-path avenlab-server/Cargo.toml');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'avenlab-tab-profile-'));
const reserve=net.createServer();
await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
const port=reserve.address().port;
await new Promise(resolve=>reserve.close(resolve));
const server=spawn(binary,[],{cwd:path.join(repo,'avenlab-server'),env:{...process.env,AVENLAB_BIND:`127.0.0.1:${port}`,AVENLAB_SOCIAL_PATH:path.join(directory,'social.json'),AVENLAB_ALPHA_LIMITS:'1',AVENLAB_ROLE_LIMITS:'1',AVENLAB_MAX_ACTIVE_WORLDS:'3',AVENLAB_MAX_PLAYERS:'12'},stdio:['ignore','pipe','pipe']});
let output='',phase='startup';
for(const stream of [server.stdout,server.stderr])stream.on('data',bytes=>output=(output+bytes.toString()).slice(-16000));
const started=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Server startup timed out. '+output.slice(-1000))),15000);
  server.stdout.on('data',bytes=>{if(bytes.toString().includes('WebSocket listening')){clearTimeout(timer);resolve();}});
  server.once('error',error=>{clearTimeout(timer);reject(error);});
  server.once('exit',code=>{clearTimeout(timer);if(code)reject(Error('Server exited: '+code));});
});

class Peer{
  constructor(){
    this.serial=0;this.messages=[];this.waiters=[];this.view=null;
    this.socket=new WebSocket(`ws://127.0.0.1:${port}`);
    this.socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data);this.messages.push(message);
      if(this.messages.length>100)this.messages.shift();
      if(message.type==='social_state')this.view=message.data;
      for(const waiter of [...this.waiters])if(waiter.test(message)){
        clearTimeout(waiter.timer);this.waiters.splice(this.waiters.indexOf(waiter),1);waiter.resolve(message);
      }
    });
  }
  wait(test){
    const previous=this.messages.findLast(test);if(previous)return Promise.resolve(previous);
    return new Promise((resolve,reject)=>{
      const waiter={test,resolve,timer:setTimeout(()=>{
        this.waiters.splice(this.waiters.indexOf(waiter),1);
        reject(Error('Expected packet not received during '+phase+'. '+output.slice(-800)));
      },12000)};
      this.waiters.push(waiter);
    });
  }
  async ready(){const welcome=await this.wait(message=>message.type==='welcome');this.player=welcome.player_id;return this;}
  async request(action,fields={}){
    const request_id=`tab-test-${++this.serial}`;
    const response=this.wait(message=>message.type==='social_result'&&message.request_id===request_id);
    this.socket.send(JSON.stringify({type:'social_request',action,request_id,...fields}));
    return response;
  }
  async command(action,fields={}){
    const response=await this.request(action,fields);assert(response.ok,response.message);return response.data;
  }
  close(){for(const waiter of this.waiters)clearTimeout(waiter.timer);this.waiters=[];this.socket.close();}
}

const peers=[],checks=[];
try{
  await started;
  const a=await new Peer().ready();peers.push(a);
  const b=await new Peer().ready();peers.push(b);
  phase='first profile';
  const primary=await a.command('identify',{name:'Primary driver'});
  assert(primary.token&&primary.profile_id);
  phase='unauthenticated Quickplay';
  const early=await b.request('mode_join',{mode:'quickplay',map:'road_precision',hero:''});
  assert.equal(early.ok,false);assert.match(early.message,/player profile/i);
  checks.push('Quickplay still requires an authenticated profile');

  phase='duplicate profile';
  const duplicate=await b.request('identify',{name:'Must not rename primary',token:primary.token});
  assert.equal(duplicate.ok,false);assert.match(duplicate.message,/already connected in another tab/i);
  const rejected=await b.request('mode_join',{mode:'quickplay',map:'road_precision',hero:''});
  assert.equal(rejected.ok,false);assert.match(rejected.message,/player profile/i);
  await a.wait(message=>message.type==='social_state'&&message.data.profile.id===primary.profile_id);
  assert.equal(a.view.profile.name,'Primary driver');
  checks.push('Duplicate online profile is rejected without impersonation or primary-profile mutation');

  phase='independent tab profile';
  const secondary=await b.command('identify',{name:'Second tab driver'});
  assert(secondary.token);assert.notEqual(secondary.profile_id,primary.profile_id);
  const first=await a.command('mode_join',{mode:'quickplay',map:'road_precision',hero:''});
  const second=await b.command('mode_join',{mode:'quickplay',map:'road_precision',hero:''});
  assert.equal(first.status,'joined');assert.equal(second.status,'joined');
  assert.equal(first.world_id,second.world_id);
  const av=(await a.wait(message=>message.type==='social_state'&&message.data.alpha?.active?.mode==='quickplay'&&message.data.alpha.roster.length===2)).data;
  const bv=(await b.wait(message=>message.type==='social_state'&&message.data.alpha?.active?.mode==='quickplay'&&message.data.alpha.roster.length===2)).data;
  assert.equal(av.profile.id,primary.profile_id);assert.equal(bv.profile.id,secondary.profile_id);
  assert.notEqual(av.alpha.active.team,bv.alpha.active.team);
  assert.deepEqual(new Set(av.alpha.roster.map(card=>card.id)),new Set([primary.profile_id,secondary.profile_id]));
  checks.push('Two distinct profiles join the same Quickplay world on opposing teams with correct roster ownership');
  const members=av.worlds.find(world=>world.id===first.world_id).members;
  assert.equal(members.find(member=>member.player_id===a.player).profile_id,primary.profile_id);
  assert.equal(members.find(member=>member.player_id===b.player).profile_id,secondary.profile_id);
  assert(members.every(member=>member.level===1));
  assert(members.every(member=>!Object.hasOwn(member,'mmr')));
  checks.push('Public world members map each physics player to its authenticated profile and actual progression level without invented MMR');


  phase='second-profile reconnect';
  const closed=new Promise(resolve=>b.socket.addEventListener('close',resolve,{once:true}));b.close();await closed;
  await new Promise(resolve=>setTimeout(resolve,120));
  const rejoined=await new Peer().ready();peers.push(rejoined);
  const restored=await rejoined.command('identify',{name:'Second tab driver',token:secondary.token});
  assert.equal(restored.profile_id,secondary.profile_id);
  const resumed=(await rejoined.wait(message=>message.type==='social_state'&&message.data.alpha?.active?.mode==='quickplay')).data;
  assert.equal(resumed.profile.id,secondary.profile_id);assert.equal(resumed.alpha.active.world_id,first.world_id);
  assert.equal(a.view.profile.id,primary.profile_id);
  checks.push('Second-profile token reconnects to its own reserved Quickplay seat while the primary profile remains connected');
  console.log(JSON.stringify({checks,failures:0},null,2));
}finally{
  for(const peer of peers)peer.close();server.kill();
  await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve);});
  fs.rmSync(directory,{recursive:true,force:true});
}
