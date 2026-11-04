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
    return new Promise((resolve,reject)=>{const waiter={predicate,resolve,timer:setTimeout(()=>{this.waiters.splice(this.waiters.indexOf(waiter),1);reject(new Error("Expected local packet did not arrive during "+phase+". Sent combat: "+JSON.stringify(lastIntent?.combat)+". Latest telemetry: "+JSON.stringify(this.messages.findLast(m=>m.type==="snapshot")?.data.entities.map(e=>({vehicle:e.vehicle_id,speed:e.speed,combat:e.combat})))+" "+output.slice(-500)));},12000)};this.waiters.push(waiter);});
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
const peers=[];let timer;let phase="startup";let lastIntent=null;
try {
 await started;const a=await new Peer().ready('Tank test');peers.push(a);
 const world=(await a.command('world_create',{name:'Tank range',map:'coastal_district',listed:true,max_players:2})).world_id;
 await a.command('world_join',{world_id:world});await a.spawn('coastal_district');
 let seq=0,fire=false,weapon='cannon',ram=false,locked=false,brake=0;timer=setInterval(()=>a.socket.send(JSON.stringify(lastIntent={type:'input',seq:++seq,dt:1/60,throttle:0,steer:0,brake,handbrake:0,vehicleMask:1,playerMask:0,combat:{weapon,ram,hull_locked:locked,ram_remaining:999,ram_cooldown:0,enabled:true,fire,yaw:Math.PI,pitch:-.12,x:99,y:99,z:99,role:'medic'}})),16);
 const first=await a.wait(m=>m.type==='snapshot'&&m.data.entities.some(e=>e.id===a.player&&e.combat?.enabled));const tank=first.data.entities.find(e=>e.id===a.player);assert.equal(tank.vehicle_id,'tank');assert.equal(tank.combat.role,'tank');assert.equal(tank.combat.x,0);assert(tank.combat.y<2);
 const setup=await a.wait(m=>m.type==='vehicle_config'&&m.data.player_id===a.player);assert.equal(setup.data.config.hud.forward_gears,6);assert.equal(setup.data.config.hud.max_rpm,4200);assert.equal(setup.data.config.max_speed,30);
 const b=await new Peer().ready('Observer');peers.push(b);await b.command('world_join',{world_id:world});await b.spawn('coastal_district','brz');
 phase='cannon';fire=true;const fired=await b.wait(m=>m.type==='snapshot'&&m.data.entities.some(e=>e.id===a.player&&e.combat?.shot===1));let pose=fired.data.entities.find(e=>e.id===a.player).combat;assert.equal(pose.cannon_shot,1);assert(Array.isArray(pose.impact),'observer receives cannon explosion position');assert.equal(pose.ammo,0);assert(pose.reload>2.5);assert(pose.cannon_reload>2.5);assert.equal(pose.coax_reload,0);assert(pose.pitch<=0.36);
 const later=await b.wait(m=>m.type==='snapshot'&&m.data.tick>fired.data.tick+30);pose=later.data.entities.find(e=>e.id===a.player).combat;assert.equal(pose.shot,1);assert(pose.reload<3);
 phase='coax';weapon='coax';const mg=await b.wait(m=>m.type==='snapshot'&&m.data.tick>later.data.tick&&m.data.entities.some(e=>e.id===a.player&&e.combat?.weapon==='coax'&&e.combat?.shot>1));pose=mg.data.entities.find(e=>e.id===a.player).combat;assert.equal(pose.cannon_shot,1);assert.equal(pose.ammo,255);assert(pose.cannon_reload>0);assert(pose.coax_reload>=0&&pose.coax_reload<=.11);
 phase='basket secondary';weapon='basket';const basket=await b.wait(m=>m.type==='snapshot'&&m.data.tick>mg.data.tick&&m.data.entities.some(e=>e.id===a.player&&e.combat?.weapon==='basket'&&e.combat?.shot_weapon==='basket'&&e.combat?.shot>pose.shot));
 const basketEntity=basket.data.entities.find(e=>e.id===a.player);pose=basketEntity.combat;assert.equal(pose.cannon_shot,1);assert(pose.cannon_reload>0);assert(pose.basket_reload>0&&pose.basket_reload<=.11);assert(pose.coax_reload>=0&&pose.coax_reload<=.11);assert(Array.isArray(pose.shot_origin));
 // Remove hull attitude and turret yaw before checking the model's side
 // offset. Authored team spawns need not face world +Z, and the event muzzle
 // precedes the completed physics pose by one substep.
 const inverseRotate=(q,v)=>{const [x,y,z,w]=[-q[0],-q[1],-q[2],q[3]],[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];};
 const localMuzzle=inverseRotate(basketEntity.rotation,pose.shot_origin.map((value,i)=>value-basketEntity.position[i]));
 const localAim=inverseRotate(basketEntity.rotation,[-Math.sin(pose.yaw)*Math.cos(pose.pitch),Math.sin(pose.pitch),-Math.cos(pose.yaw)*Math.cos(pose.pitch)]);
 const turretYaw=Math.atan2(localAim[0],localAim[2]),gunSide=Math.cos(turretYaw)*localMuzzle[0]-Math.sin(turretYaw)*(localMuzzle[2]-.1);
 assert(Math.abs(gunSide-(-.3396))<.035,'secondary belongs to the measured small barrel, not the roof gun: '+JSON.stringify({gunSide,localMuzzle}));
 phase='weapon switch';weapon='cannon';fire=false;const selected=await b.wait(m=>m.type==='snapshot'&&m.data.tick>mg.data.tick&&m.data.entities.some(e=>e.id===a.player&&e.combat?.weapon==='cannon'));pose=selected.data.entities.find(e=>e.id===a.player).combat;assert.equal(pose.cannon_shot,1);assert(pose.reload>0);assert.equal(pose.ammo,0);
 fire=true;const blocked=await b.wait(m=>m.type==='snapshot'&&m.data.tick>selected.data.tick+10);assert.equal(blocked.data.entities.find(e=>e.id===a.player).combat.cannon_shot,1);
 phase='angle lock';fire=false;locked=true;
 const lockedFrame=await b.wait(m=>m.type==='snapshot'&&m.data.tick>blocked.data.tick&&m.data.entities.some(e=>e.id===a.player&&e.combat?.hull_locked));
 const aligned=lockedFrame.data.entities.find(e=>e.id===a.player);const c=aligned.combat;
 assert(Number.isFinite(c.lock_yaw)&&Number.isFinite(c.lock_pitch));
 const held=await b.wait(m=>m.type==='snapshot'&&m.data.tick>lockedFrame.data.tick+12);
 const heldPose=held.data.entities.find(e=>e.id===a.player).combat;
 assert(Math.abs(heldPose.lock_yaw-c.lock_yaw)<.001);assert(Math.abs(heldPose.lock_pitch-c.lock_pitch)<.001);
 phase='Ram readiness';await b.wait(m=>m.type==='snapshot'&&m.data.tick>held.data.tick&&m.data.entities.some(e=>e.id===a.player&&e.combat?.ram_blocked===''));
 phase='ram launch';ram=true;const charge=await b.wait(m=>m.type==='snapshot'&&m.data.entities.some(e=>e.id===a.player&&e.combat?.ram_remaining>3));
 assert(charge.data.entities.find(e=>e.id===a.player).speed>8,'Ram launches immediately over the real socket');
 phase='ram sustain';ram=false;const charging=await b.wait(m=>m.type==='snapshot'&&m.data.tick>charge.data.tick+25);pose=charging.data.entities.find(e=>e.id===a.player).combat;assert(pose.ram_remaining>5&&pose.ram_remaining<7);assert(pose.ram_cooldown>58&&pose.ram_cooldown<=60);
 phase='ram brake cancel';brake=1;const cancelled=await b.wait(m=>m.type==='snapshot'&&m.data.tick>charging.data.tick&&m.data.entities.some(e=>e.id===a.player&&e.combat?.ram_remaining===0));assert(cancelled.data.entities.find(e=>e.id===a.player).combat.ram_cooldown>0);
 phase='ram cooldown';ram=true;const denied=await b.wait(m=>m.type==='snapshot'&&m.data.tick>cancelled.data.tick+10);assert.equal(denied.data.entities.find(e=>e.id===a.player).combat.ram_remaining,0);
 phase='fire after ram';fire=true;const lastFire=await b.wait(m=>m.type==='snapshot'&&m.data.tick>denied.data.tick&&m.data.entities.some(e=>e.id===a.player&&e.combat?.fire));
 clearInterval(timer);timer=null;const stopped=await b.wait(m=>m.type==='snapshot'&&m.data.tick>lastFire.data.tick+30);assert.equal(stopped.data.entities.find(e=>e.id===a.player).combat.fire,false);
 phase='practice body retention';const before=stopped.data.entities.find(e=>e.id===a.player);a.close();await new Promise(resolve=>setTimeout(resolve,100));
 const recovered=await new Peer().ready('Temporary recovery');peers.push(recovered);await recovered.command('identify',{name:'Tank test',token:a.identity.token});await recovered.wait(m=>m.type==='session_restored'&&m.preserved===true);
 const restored=await recovered.wait(m=>m.type==='snapshot'&&m.data.entities.some(e=>e.id===recovered.player&&e.vehicle_id==='tank'));const after=restored.data.entities.find(e=>e.id===recovered.player);
 assert(Math.abs(after.boost_fraction-before.boost_fraction)<.001,'nitrous reserve survives reconnect');assert(after.condition<.99,'Ram wear survives reconnect');assert(after.combat.ram_cooldown>before.combat.ram_cooldown-5,'cooldown survives reconnect');assert(Math.hypot(...after.position.map((n,i)=>n-before.position[i]))<3,'body stays near its pre-disconnect position');
 console.log(JSON.stringify({passed:['real tank spawn uses factory turret role/mount','tank config publishes six gears, 4200 RPM and 108 km/h','observer receives the cannon shot counter and explosion impact position','observer receives all three independent weapon cooldown timers','observer receives independent turret pose and bounded elevation','one shell fires and reload blocks repeated shots','roof gun selection and fire replicate to an observer','basket secondary selection, measured forward muzzle and short independent reload replicate to an observer','switching preserves cannon reload and blocks another shell','server angle lock retains both captured local axes','Ram immediately launches from rest over the real socket','three-second charge, seven-second total boost and sixty-second cooldown replicate from server-owned timers','braking cancels Ram without resetting its cooldown','Ram cannot be restarted while cooling down','stale held fire cancels over real WebSocket','authenticated reconnect retains a custom-world tank position, wear, nitrous and cooldown'],failures:0},null,2));
}finally{if(timer)clearInterval(timer);for(const p of peers)p.close();child.kill();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});fs.rmSync(directory,{recursive:true,force:true});}
