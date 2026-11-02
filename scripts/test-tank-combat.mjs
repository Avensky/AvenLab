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
  async spawn(map,vehicle="tank"){const result=this.wait(message=>message.type==="spawn_ready"&&message.map===map);this.socket.send(JSON.stringify({type:"spawn_request",vehicle,map,mode:"sandbox"}));await result;}
  close(){for(const waiter of this.waiters)clearTimeout(waiter.timer);this.waiters=[];this.socket.close();}
}
const peers=[];let timer;
try {
 await started;const a=await new Peer().ready('Tank test');peers.push(a);
 const world=(await a.command('world_create',{name:'Tank range',map:'coastal_district',listed:true,max_players:2})).world_id;
 await a.command('world_join',{world_id:world});await a.spawn('coastal_district');
 let seq=0,fire=false;timer=setInterval(()=>a.socket.send(JSON.stringify({type:'input',seq:++seq,dt:1/60,throttle:0,steer:0,brake:0,handbrake:0,vehicleMask:0,playerMask:0,combat:{enabled:true,fire,yaw:0,pitch:1,x:99,y:99,z:99,role:'medic'}})),16);
 const first=await a.wait(m=>m.type==='snapshot'&&m.data.entities.some(e=>e.id===a.player&&e.combat?.enabled));const tank=first.data.entities.find(e=>e.id===a.player);assert.equal(tank.vehicle_id,'tank');assert.equal(tank.combat.role,'tank');assert.equal(tank.combat.x,0);assert(tank.combat.y<2);
 const b=await new Peer().ready('Observer');peers.push(b);await b.command('world_join',{world_id:world});await b.spawn('coastal_district','brz');
 fire=true;const fired=await b.wait(m=>m.type==='snapshot'&&m.data.entities.some(e=>e.id===a.player&&e.combat?.shot===1));let pose=fired.data.entities.find(e=>e.id===a.player).combat;assert.equal(pose.ammo,0);assert(pose.reload>2.5);assert(pose.pitch<=0.36);
 const later=await b.wait(m=>m.type==='snapshot'&&m.data.tick>fired.data.tick+30);pose=later.data.entities.find(e=>e.id===a.player).combat;assert.equal(pose.shot,1);assert(pose.reload<3);
 clearInterval(timer);timer=null;const stopped=await b.wait(m=>m.type==='snapshot'&&m.data.tick>later.data.tick+30);assert.equal(stopped.data.entities.find(e=>e.id===a.player).combat.fire,false);
 console.log(JSON.stringify({passed:['real tank spawn uses factory turret role/mount','observer receives independent turret pose and bounded elevation','one shell fires and reload blocks repeated shots','stale held fire cancels over real WebSocket'],failures:0},null,2));
}finally{if(timer)clearInterval(timer);for(const p of peers)p.close();child.kill();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});fs.rmSync(directory,{recursive:true,force:true});}
