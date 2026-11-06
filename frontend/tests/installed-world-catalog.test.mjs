import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {installedMapDefinitions,visibleMapDefinitions,NO_INSTALLED_MAP,reuseMapDefinitions} from '../src/store/selection/worldCatalogCore.ts';

test('empty world selection has a stable immutable snapshot for React',()=>{
 const first=NO_INSTALLED_MAP;
 const second=NO_INSTALLED_MAP;
 assert.strictEqual(first,second);
 assert(Object.isFrozen(first));
 assert.equal(first.id,'');
});

test('same server inventory reuses list identity rather than notifying React',()=>{
  const current=[{id:'harbor_canal_fleet',name:'Fleet',desc:'Canal'}];
  assert.strictEqual(reuseMapDefinitions(current,[{...current[0]}]),current);
  assert.notStrictEqual(reuseMapDefinitions(current,[{...current[0],name:'Different'}]),current);
  assert.notStrictEqual(reuseMapDefinitions(current,[]),current);
});

test('manifest exposes only installed worlds, including original fleet and widened harbor',async()=>{
 const source=JSON.parse(await readFile(new URL('../public/world-builder/catalog.json',import.meta.url)));
 const maps=installedMapDefinitions(source);
 assert(maps.some(map=>map.id==='harbor_canal_fleet_classic'));
 assert(maps.some(map=>map.id==='harbor_canal_fleet'));
 assert.equal(maps.length,source.maps.length);
 assert.equal(new Set(maps.map(map=>map.id)).size,maps.length);
});

test('map picker ignores malformed rows, unexpected files and duplicates',()=>{
 const maps=installedMapDefinitions({maps:[
   {map_id:'fleet',file:'fleet_colliders.json',name:'Fleet',desc:'Installed'},
   {map_id:'fleet',file:'fleet_colliders.json',name:'Duplicate'},
   {map_id:'deleted',file:'unrelated.json'},
   {map_id:'../../escape',file:'../../escape_colliders.json'},
   {map_id:'other',file:'other_colliders.json',desc:'Also installed'},
 ]});
 assert.deepEqual(maps.map(map=>map.id),['fleet','other']);
 assert.deepEqual(visibleMapDefinitions(maps,['other','not-installed']).map(map=>map.id),['other']);
 assert.deepEqual(visibleMapDefinitions(maps,[]),[]);
 assert.deepEqual(visibleMapDefinitions(maps,null),maps);
 assert.throws(()=>installedMapDefinitions({missing:'maps'}));
});

test('Quickplay only opts in CTF environments; classic map remains editor-only',async()=>{
 const names=['harbor_canal_red','harbor_canal_blue','harbor_canal_fleet','streaming_endless_city','harbor_canal_fleet_classic'];
 for(const name of names){
   const file=JSON.parse(await readFile(new URL(`../../avenlab-server/src/assets/blocks/${name}_colliders.json`,import.meta.url)));
   if(name.endsWith('_classic'))assert.equal(file.quickplay,undefined);
   else assert.equal(file.quickplay?.objective,'ctf',`${name} must opt into CTF`);
 }
});
