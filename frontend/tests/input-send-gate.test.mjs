import test from 'node:test';
import assert from 'node:assert/strict';
import {encodePackedInput} from '../src/net/packedInput.ts';
import {InputSendGate} from '../src/net/inputSendGate.ts';

test('unchanged input refreshes at 100 ms; changed controls and reset send immediately',()=>{
 const gate=new InputSendGate(), input={seq:1,dt:1/60,throttle:.5,steer:0,brake:0,handbrake:0,vehicleMask:97,playerMask:0,debug_mask:0,
  combat:{enabled:true,fire:true,ram:false,hull_locked:false,weapon:'coax',yaw:0,pitch:0,x:0,y:0,z:0,role:'assault'}};
 const first=encodePackedInput(input); assert(gate.shouldSend(first,0));gate.sent(first,0);
 const unchanged=encodePackedInput({...input,seq:2,dt:.08});
 assert(!gate.shouldSend(unchanged,16));assert(!gate.shouldSend(unchanged,99));assert(gate.shouldSend(unchanged,100));
 for(const change of [{throttle:0},{steer:.001},{brake:1},{vehicleMask:0},{cockpit_mask:0},{debug_mask:1},{combat:{...input.combat,fire:false}},{combat:{...input.combat,lock_target:[0,0]}}])
  assert(gate.shouldSend(encodePackedInput({...input,...change}),16));
 gate.reset();assert(gate.shouldSend(unchanged,16));
});
