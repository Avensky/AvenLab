import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';

test('ability flashes follow confirmed events and never replay repeated observations',async()=>{
  const vite=await createServer({server:{middlewareMode:true,ws:false,hmr:false},appType:'custom',logLevel:'error'});
  try {
    const {emitAbilitySparks}=await vite.ssrLoadModule('/src/combat/abilitySparks.ts');
    const base={vehicle_id:'fortuner',room_id:1,position:[1,2,3],health:{revive_cooldown_s:0},support:{sequence:4,pack:null}};
    const pack={seq:5,state:'flying',origin:[1,3,3],position:[2,3,3],target_position:[4,3,3],healed_hp:0,remaining_s:.2,duration_s:.4};
    const launch={...base,support:{sequence:5,pack}};
    const hit={...base,support:{sequence:5,pack:{...pack,state:'hit',position:pack.target_position,healed_hp:40}}};
    const flashes=(before,after)=>{
      const result=[];
      emitAbilitySparks(before,after,(at,healing)=>result.push({at,healing}));
      return result;
    };
    assert.deepEqual(flashes(base,launch),[{at:pack.origin,healing:true}]);
    assert.deepEqual(flashes(launch,hit),[{at:pack.target_position,healing:true}]);
    assert.deepEqual(flashes(hit,hit),[]);
    assert.deepEqual(flashes(launch,{...hit,support:{...hit.support,pack:{...hit.support.pack,healed_hp:0}}}),[]);
    assert.deepEqual(flashes({...base,room_id:2},hit),[]);
    assert.deepEqual(flashes(base,{...hit,vehicle_id:'mini'}),[]);
    const guard={...base,guard:{cooldown_s:0}};
    const casting={...guard,guard:{cooldown_s:15}};
    assert.equal(flashes(guard,casting)[0].healing,false);
    assert.deepEqual(flashes(casting,casting),[]);
    assert.equal(flashes(base,{...base,health:{revive_cooldown_s:60}})[0].healing,true);
  } finally {await vite.close();}
});
