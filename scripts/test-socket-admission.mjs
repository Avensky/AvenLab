#!/usr/bin/env node
/** Bounded pre-WebSocket admission, against a disposable local Rust server. */
import assert from 'node:assert/strict';
import net from 'node:net';
import {startTestServer} from './lib/live-match-server.mjs';
const test=await startTestServer(),{port}=test;
const sockets=[];
function deadline(promise,ms,label){
 let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out: '+test.output().slice(-1000))),ms);})]).finally(()=>clearTimeout(timer));
}
async function raw(){
 const socket=net.connect(port,'127.0.0.1');sockets.push(socket);socket.resume();
 const closed=new Promise(resolve=>socket.once('close',()=>resolve(performance.now())));
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
 return {socket,closed,opened:performance.now()};
}
try{
 const pending=[];
 for(let i=0;i<32;i++)pending.push(await raw());
 const excess=await raw();
 await deadline(excess.closed,1500,'excess pending handshake');
 await deadline(Promise.all(pending.map(p=>p.closed)),7500,'idle handshakes');
 const peer=await deadline(test.newPeer(),3000,'admission after timeout');
 assert(peer.player);
 console.log('PASS: 32 unfinished handshakes expire, excess connections close, and normal admission resumes.');
}finally{
 for(const socket of sockets)socket.destroy();
 await test.close();
}
