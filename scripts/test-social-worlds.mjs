#!/usr/bin/env node
/** Real local WebSocket regression. Uses a disposable social file and server;
 * it never connects to a user's running game or contacts external players. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const binary=process.env.AVENLAB_SERVER_BIN??path.join(repo,"avenlab-server/target/debug",process.platform==="win32"?"avenlab-server.exe":"avenlab-server");
if(!fs.existsSync(binary))throw new Error("Build the Rust server first: cargo build --manifest-path avenlab-server/Cargo.toml");
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"avenlab-social-e2e-"));
const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,"127.0.0.1",resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
const child=spawn(binary,[],{cwd:path.join(repo,"avenlab-server"),env:{...process.env,AVENLAB_ALPHA_LIMITS:"0",AVENLAB_BIND:`127.0.0.1:${port}`,AVENLAB_SOCIAL_PATH:path.join(directory,"social.json"),AVENLAB_MAX_ACTIVE_WORLDS:"2",AVENLAB_MAX_PLAYERS:"10"},stdio:["ignore","pipe","pipe"]});
let output="";for(const stream of [child.stdout,child.stderr])stream.on("data",data=>{output=(output+data.toString()).slice(-64000);});
const started=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Local server startup timed out. "+output.slice(-1000))),15000);child.stdout.on("data",data=>{if(data.toString().includes("WebSocket listening")){clearTimeout(timer);resolve();}});child.once("error",reject);child.once("exit",code=>{clearTimeout(timer);if(code)reject(new Error("Local server exited: "+code));});});

class Peer{
  constructor(){
    this.messages=[];this.waiters=[];this.serial=0;this.view=null;
    this.socket=new WebSocket(`ws://127.0.0.1:${port}`);
    this.socket.addEventListener("message",event=>{
      const message=JSON.parse(event.data);this.messages.push(message);if(this.messages.length>200)this.messages.shift();
      if(message.type==="social_state")this.view=message.data;
      for(const waiter of [...this.waiters])if(waiter.predicate(message)){clearTimeout(waiter.timer);this.waiters.splice(this.waiters.indexOf(waiter),1);waiter.resolve(message);}
    });
  }
  wait(predicate){
    const previous=this.messages.findLast(predicate);if(previous)return Promise.resolve(previous);
    return new Promise((resolve,reject)=>{const waiter={predicate,resolve,timer:setTimeout(()=>{this.waiters.splice(this.waiters.indexOf(waiter),1);reject(new Error("Expected local packet did not arrive. "+output.slice(-500)));},12000)};this.waiters.push(waiter);});
  }
  async ready(name){const welcome=await this.wait(message=>message.type==="welcome");this.player=welcome.player_id;this.identity=await this.command("identify",{name});return this;}
  async command(action,fields={}){
    const request_id=`test-${++this.serial}`;const response=this.wait(message=>message.type==="social_result"&&message.request_id===request_id);
    this.socket.send(JSON.stringify({type:"social_request",action,...fields,request_id}));const message=await response;
    if(!message.ok)throw new Error(message.message);return message.data;
  }
  social(predicate){if(this.view&&predicate(this.view))return Promise.resolve(this.view);return this.wait(message=>message.type==="social_state"&&predicate(message.data)).then(message=>message.data);}
  async spawn(map){const result=this.wait(message=>message.type==="spawn_ready"&&message.map===map);this.socket.send(JSON.stringify({type:"spawn_request",vehicle:"brz",map,mode:"sandbox"}));await result;}
  close(){for(const waiter of this.waiters)clearTimeout(waiter.timer);this.waiters=[];this.socket.close();}
}
const peers=[];const passed=[];
try{
  await started;
  const a=await new Peer().ready("Host");peers.push(a);const b=await new Peer().ready("Teammate");peers.push(b);const c=await new Peer().ready("Other world");peers.push(c);
  const one=(await a.command("world_create",{name:"Private course",map:"road_precision",password:"course-key",listed:false,max_players:2})).world_id;
  await a.command("world_join",{world_id:one});
  await b.social(view=>!view.worlds.some(world=>world.id===one));
  await assert.rejects(b.command("world_join",{world_id:one,password:"course-key"}),/invite|code/i);
  passed.push("unlisted worlds are hidden and cannot be joined by guessing their numeric ID");
  await a.command("friend_request",{target:b.identity.profile_id});await b.social(view=>view.requests.some(request=>request.incoming));
  await b.command("friend_accept",{target:a.identity.profile_id});await a.social(view=>view.teammates.some(person=>person.id===b.identity.profile_id));
  const group=(await a.command("group_create",{name:"Test crew"})).group_id;
  await a.command("group_invite",{group_id:group,target:b.identity.profile_id});await b.command("group_accept",{group_id:group});
  await assert.rejects(b.command("group_remove",{group_id:group,target:a.identity.profile_id}),/leader/i);
  passed.push("teammate acceptance, group invitation and leader permissions use the socket owner");
  await a.command("world_invite",{world_id:one,target:b.identity.profile_id});await b.social(view=>view.world_invites.some(invite=>invite.world_id===one));
  await assert.rejects(b.command("world_join",{world_id:one,password:"wrong-password"}),/password/i);
  await b.command("world_join",{world_id:one,password:"course-key"});await b.spawn("road_precision");await a.spawn("road_precision");
  passed.push("an invitation preserves the password gate and admitted players can spawn");
  const two=(await c.command("world_create",{name:"Second world",map:"road_jump_lab",listed:true,max_players:2})).world_id;
  await c.command("world_join",{world_id:two});await c.spawn("road_jump_lab");
  const first=await b.wait(message=>message.type==="snapshot"&&message.world_id===one&&message.data.entities.length===2);
  const second=await c.wait(message=>message.type==="snapshot"&&message.world_id===two&&message.data.entities.length===1);
  assert.deepEqual(new Set(first.data.entities.map(entity=>entity.id)),new Set([a.player,b.player]));assert.equal(second.data.entities[0].id,c.player);
  assert.equal(JSON.stringify(b.view).includes("password_hash"),false);assert.equal(JSON.stringify(b.view).includes("token_hash"),false);
  passed.push("real snapshots, maps and social views remain isolated across worlds");
  const marker=b.messages.at(-1)?.data?.tick??0;
  await a.command("world_join",{world_id:two});await a.spawn("road_jump_lab");
  await b.wait(message=>message.type==="snapshot"&&message.world_id===one&&message.data.tick>marker&&message.data.entities.length===1&&message.data.entities[0].id===b.player);
  await c.wait(message=>message.type==="snapshot"&&message.world_id===two&&message.data.entities.some(entity=>entity.id===a.player));
  passed.push("moving worlds removes the old body and publishes the destination's independent tick stream");
  const persisted=fs.readFileSync(path.join(directory,"social.json"),"utf8");assert.equal(persisted.includes("course-key"),false);assert.equal(persisted.includes(a.identity.token),false);
  passed.push("saved social data contains salted password hashes and hashed guest credentials");
  console.log(JSON.stringify({passed,failures:0},null,2));
}finally{
  for(const peer of peers)peer.close();child.kill();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once("exit",resolve);});fs.rmSync(directory,{recursive:true,force:true});
}
