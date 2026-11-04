import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'vite';

test('extensionless source imports cannot select another TS/TSX module on Windows',()=>{
 const modules=new Map();
 for(const name of fs.readdirSync('src',{recursive:true})){
  if(!/\.(?:tsx?|jsx?)$/.test(name))continue;
  const key=name.replace(/\.(?:tsx?|jsx?)$/,'').toLowerCase();
  const paths=modules.get(key)??[];paths.push(name);modules.set(key,paths);
 }
 const collisions=[...modules.values()].filter(files=>files.length>1);
 assert.deepEqual(collisions,[],'case-insensitive lookup must have only one possible source module per basename');
 const markers=fs.readFileSync('src/game/stats/CtfFlagMarkers.tsx','utf8');
 assert.match(markers,/from ['"]\.\/CtfFlagCloth['"]/);
 assert(!fs.existsSync('src/game/stats/FlagCloth.tsx'));
 assert(!fs.existsSync('src/game/stats/flagCloth.ts'));
});

test('the exact flag component and motion modules provide their requested exports',async()=>{
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},cacheDir:'node_modules/.vite-portable-modules-test'});
 try{
  const component=await vite.ssrLoadModule('/src/game/stats/CtfFlagCloth.tsx');
  const motion=await vite.ssrLoadModule('/src/game/stats/flagClothMotion.ts');
  assert.equal(typeof component.CtfFlagCloth,'function');
  assert.equal(typeof motion.flagClothTargetYaw,'function');
  assert.equal(typeof motion.updateFlagCloth,'function');
  assert.notEqual(path.basename('CtfFlagCloth').toLowerCase(),path.basename('flagClothMotion').toLowerCase());
 }finally{await vite.close();}
});
