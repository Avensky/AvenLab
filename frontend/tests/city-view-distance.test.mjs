import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { CITY_VIEW_DISTANCES, isCityViewDistance, resolveCityViewDistance } from '../src/world/cityViewDistance.ts';
import { cityBlockLevels } from '../src/world/cityBlocks.ts';
import { detailedCityChunks } from '../src/world/cityLod.ts';

const block=(key,x)=>({key,minX:x,maxX:x+10,minZ:-10,maxZ:10});

test('Auto retains current ranges; explicit view distance is independent of geometry quality',()=>{
 assert.equal(resolveCityViewDistance('fast'),500);assert.equal(resolveCityViewDistance('balanced'),750);
 for(const distance of CITY_VIEW_DISTANCES.slice(1)){
  assert.equal(resolveCityViewDistance('fast',distance),distance);assert.equal(resolveCityViewDistance('balanced',distance),distance);
  assert.equal(resolveCityViewDistance('original',distance),Infinity);
 }
 for(const invalid of [undefined,null,'500',NaN,Infinity,0,-1,999,{},true])assert.equal(isCityViewDistance(invalid),false);
 assert.equal(resolveCityViewDistance('fast',999),500);
});

test('all distance presets control the model-to-skyline transition while keeping nearby native geometry',()=>{
 for(const distance of [250,500,750,1000])for(const quality of ['fast','balanced']){
  const levels=cityBlockLevels([block('near',40),block('inside',distance-1),block('outside',distance+1)],0,0,quality,{},distance);
  assert.equal(levels.near,'full');assert.equal(levels.inside,'reduced');assert.equal(levels.outside,'proxy');
  assert.equal(cityBlockLevels([block('edge',distance+30)],0,0,quality,{edge:'reduced'},distance).edge,'reduced');
  assert.equal(cityBlockLevels([block('edge',distance+36)],0,0,quality,{edge:'reduced'},distance).edge,'proxy');
 }
 const b=[block('close',100),block('far',2000)];
 assert.equal(cityBlockLevels(b,0,0,'fast',{},1000).close,'reduced');
 assert.equal(cityBlockLevels(b,0,0,'balanced',{},250).close,'full');
 assert.equal(cityBlockLevels(b,0,0,'original',{},250).far,'full');
});

test('explicit ranges also apply to custom chunk metadata without changing Auto or metadata-free fallbacks',()=>{
 const chunks=Array.from({length:6},(_,x)=>({x,z:0,origin:[x*200,0,0]}));
 const map={cell:[200,400],chunks,collider_chunks:chunks.map(c=>({...c,boxes:[]}))};
 assert.equal(detailedCityChunks(map,0,0,'fast').length,2);
 assert.deepEqual(new Set(detailedCityChunks(map,0,0,'fast',[],[1,0],750)),new Set(['0,0','1,0','2,0','3,0','4,0']));
 assert.deepEqual(detailedCityChunks(map,0,0,'fast',[],undefined,250),['0,0','1,0']);
 assert.equal(detailedCityChunks({...map,collider_chunks:undefined},0,0,'fast',[],undefined,250).length,6);
});

test('distance and interpolation preferences hydrate safely, survive sessions, and remain independent of graphics presets',async()=>{
 const data=new Map(),before=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}});
 const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
 try{
  const {useRenderSettingsStore:render}=await server.ssrLoadModule('/src/store/renderSettingsStore.ts');
  const {useDebugViewStore:debug}=await server.ssrLoadModule('/src/store/debugViewStore.ts');
  assert.equal(render.getState().cityViewDistance,'auto');assert.equal(debug.getState().interpolationEnabled,true);
  render.getState().update({cityViewDistance:1000,cityQuality:'fast'});debug.getState().setInterpolationEnabled(false);
  assert.equal(JSON.parse(data.get('avenlab-display-v1')).state.cityViewDistance,1000);
  assert.equal(JSON.parse(data.get('avenlab-debug-view-v1')).state.interpolationEnabled,false);
  render.getState().startSandbox();assert.equal(render.getState().cityViewDistance,1000);assert.equal(debug.getState().interpolationEnabled,false);
  await debug.persist.rehydrate();assert.equal(debug.getState().interpolationEnabled,false);
  for(const value of [false,true]){
   debug.getState().setInterpolationEnabled(value);render.getState().baseline();assert.equal(debug.getState().interpolationEnabled,value);
   render.getState().cityPerformancePreset();assert.equal(debug.getState().interpolationEnabled,value);assert.equal(render.getState().cityViewDistance,'auto');
  }
  data.set('avenlab-display-v1',JSON.stringify({version:1,state:{cityQuality:'balanced',cityViewDistance:'bad',reflections:false}}));
  await render.persist.rehydrate();assert.equal(render.getState().cityViewDistance,'auto');assert.equal(render.getState().cityQuality,'balanced');assert.equal(render.getState().reflections,false);
  data.set('avenlab-debug-view-v1',JSON.stringify({version:1,state:{interpolationEnabled:'false',playerScope:'all'}}));
  await debug.persist.rehydrate();assert.equal(debug.getState().interpolationEnabled,true);assert.equal(debug.getState().playerScope,'local');
  data.set('avenlab-display-v1',JSON.stringify({version:1,state:{cityViewDistance:750}}));await render.persist.rehydrate();assert.equal(render.getState().cityViewDistance,750);
 }finally{await server.close();if(before)Object.defineProperty(globalThis,'localStorage',before);else delete globalThis.localStorage;}
});
