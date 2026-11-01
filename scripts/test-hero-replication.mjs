import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import WebSocket from '../frontend/node_modules/ws/wrapper.mjs';
import pathModule from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
// Run after cargo build and npm install in frontend. Tests use an isolated
// temporary profile file and disable solo alpha limits only in the child server.
const root=fileURLToPath(new URL('../',import.meta.url));
const scratch=fs.mkdtempSync(pathModule.join(os.tmpdir(),'avenlab-appearance-'));
const path=pathModule.join(scratch,'social.json');let server;const sockets=[],checks=[];
const address=process.env.AVENLAB_TEST_BIND??'127.0.0.1:19055';
const executable=process.env.AVENLAB_TEST_SERVER??pathModule.join(root,'avenlab-server','target','debug',process.platform==='win32'?'avenlab-server.exe':'avenlab-server');

const wait=async fn=>{const until=Date.now()+15000;while(Date.now()<until){const v=fn();if(v)return v;await new Promise(r=>setTimeout(r,20));}throw Error('Condition timed out');};
async function client(name){const ws=new WebSocket('ws://'+address),messages=[];sockets.push(ws);ws.on('message',b=>{const v=JSON.parse(b.toString());messages.push(v);if(messages.length>1000)messages.shift();});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});let sequence=0;const request=async(action,fields={})=>{const request_id=name+'-'+(++sequence);ws.send(JSON.stringify({type:'social_request',request_id,action,...fields}));const result=await wait(()=>messages.find(m=>m.request_id===request_id));return result;};const identity=await request('identify',{name});assert(identity.ok,JSON.stringify(identity));return {ws,messages,request,profileId:identity.data.profile_id,playerId:messages.find(m=>m.type==='welcome').player_id};}
try{
 server=spawn(executable,[],{cwd:pathModule.join(root,'avenlab-server'),env:{...process.env,AVENLAB_ALPHA_LIMITS:'0',AVENLAB_BIND:address,AVENLAB_SOCIAL_PATH:path},stdio:['ignore','pipe','pipe']});
 await new Promise((r,j)=>{server.stdout.on('data',b=>{if(b.toString().includes('WebSocket listening'))r();});server.once('error',j);});
 const a=await client('PAINT_ALPHA');const appearance={body:'#f4f5f7',finish:'frs',seats:'black',skin:'factory'};
 assert((await a.request('hero_loadout_save',{hero:'brz',appearance,make_default:true})).ok);
 a.ws.send(JSON.stringify({type:'spawn_request',map:'road_jump_lab',vehicle:'brz'}));await wait(()=>a.messages.find(m=>m.type==='spawn_ready'));
 const b=await client('PAINT_BETA');b.ws.send(JSON.stringify({type:'spawn_request',map:'road_jump_lab',vehicle:'ae86'}));
 await wait(()=>b.messages.find(m=>m.type==='snapshot'&&m.data.entities.some(e=>e.vehicle_id==='brz'&&e.appearance.body==='#f4f5f7')));checks.push('Another player receives saved white BRZ paint in live snapshots');
 const denied=await a.request('hero_loadout_save',{hero:'brz',appearance:{...appearance,skin:'secret-rare'},make_default:true});assert.equal(denied.ok,false);checks.push('Unowned rare skin rejected without replacing equipped paint');
 assert((await a.request('hero_loadout_save',{hero:'brz',appearance:{...appearance,body:'#ed258d'},make_default:true,profile_id:b.profileId,player_id:b.playerId})).ok);
 await wait(()=>b.messages.find(m=>m.type==='snapshot'&&m.data.entities.some(e=>e.vehicle_id==='brz'&&e.appearance.body==='#ed258d')));checks.push('Saving an equipped loadout updates the other player');
 const data=JSON.parse(fs.readFileSync(path,'utf8'));assert(Object.values(data.profiles).some(p=>p.progression.default_hero==='brz'&&p.progression.hero_loadouts.brz?.body==='#ed258d'));checks.push('Default hero and loadout persist on disk');
 assert(Object.values(data.profiles).filter(p=>p.name==='PAINT_BETA').every(p=>Object.keys(p.progression.hero_loadouts).length===0));checks.push('Client target fields cannot edit another player profile');
 console.log(JSON.stringify({checks}));
}finally{for(const ws of sockets)ws.terminate();if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}fs.rmSync(scratch,{recursive:true,force:true});}
