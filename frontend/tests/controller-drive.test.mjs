import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'vite';
test('controller triggers support automatic reverse while preserving brakes and explicit gears',async()=>{
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
 try{const {controllerDrive:drive}=await vite.ssrLoadModule('/src/controls/controllerDrive.ts');
  assert.deepEqual(drive(0,.7,0,true),{throttle:-.7,brake:0});
  assert.deepEqual(drive(.8,0,0,true),{throttle:.8,brake:0});
  assert.deepEqual(drive(.8,.7,0,true),{throttle:.8,brake:.7});
  assert.deepEqual(drive(0,.7,0,false),{throttle:0,brake:.7});
  assert.deepEqual(drive(0,0,-.8,true),{throttle:-.8,brake:0});
  assert.deepEqual(drive(0,.7,-.8,true),{throttle:-.8,brake:.7});
  assert.deepEqual(drive(0,0,0,true),{throttle:0,brake:0});
 }finally{await vite.close();}
});
