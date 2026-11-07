import test from 'node:test';
import assert from 'node:assert/strict';
import {createTireSqueal} from '../src/vehicles/effects/tireSqueal.ts';
test('tire audio is gesture-created, bounded, silent at grip, and can remount after cleanup',()=>{
 const original=globalThis.AudioContext,values=[],contexts=[];
 const node=()=>({connect(){return this;},disconnect(){},start(){},stop(){}});
 class AudioContext {
  state='running';currentTime=0;sampleRate=8;destination={};
  constructor(){contexts.push(this);}
  createGain(){return {...node(),gain:{value:0,setTargetAtTime:v=>values.push(v)}};}
  createBiquadFilter(){return {...node(),frequency:{value:0,setTargetAtTime(){}},Q:{value:0}};}
  createBuffer(){return {getChannelData:()=>new Float32Array(16)};}
  createBufferSource(){return node();}
  async close(){this.state='closed';}
 }
 globalThis.AudioContext=AudioContext;
 try{
  const audio=createTireSqueal();audio.update(1,1);assert.equal(contexts.length,0);
  audio.unlock();audio.unlock();assert.equal(contexts.length,1);
  audio.update(99,99);assert(values.at(-1)<=.16);audio.update(0,1);assert.equal(values.at(-1),0);
  audio.update(NaN,1);assert.equal(values.at(-1),0);audio.update(1,NaN);assert.equal(values.at(-1),0);
  audio.dispose();audio.unlock();assert.equal(contexts.length,2);audio.dispose();
 }finally{globalThis.AudioContext=original;}
});
