import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {VEHICLE_ASSETS,VEHICLE_ASSET_GROUPS,vehicleModelUrl,vehicleLodUrl,vehicleVariantUrl} from '../src/vehicles/assetCatalog.ts';
const publicRoot=new URL('../public/',import.meta.url);
test('every registered model, LOD and variant exists in its vehicle folder',()=>{
 const seen=new Set();
 for(const [id,asset] of Object.entries(VEHICLE_ASSETS)){
  assert(VEHICLE_ASSET_GROUPS[asset.group].includes(asset.subgroup));
  const folder=`/models/vehicles/${asset.group}/${asset.subgroup}/${id}/`;
  for(const url of [asset.model,...Object.values(asset.lods),...Object.values(asset.variants)]){
   assert(url.startsWith(folder),url);assert(!seen.has(url),url);seen.add(url);
   assert(fs.existsSync(new URL(url.slice(1),publicRoot)),url);
  }
 }
 assert.equal(seen.size,92);
});
test('every vehicle GLB is registered exactly once, including source and docked variants',()=>{
 const expected=Object.values(VEHICLE_ASSETS).flatMap(a=>[a.model,...Object.values(a.lods),...Object.values(a.variants)]).sort();
 const root=new URL('models/vehicles/',publicRoot);
 const actual=fs.readdirSync(root,{recursive:true}).filter(f=>f.endsWith('.glb')).map(f=>'/models/vehicles/'+f.replaceAll('\\','/')).sort();
 assert.deepEqual(actual,expected);
});
test('cold-join shells keep all three detail levels; missing tiers resolve to the primary model',()=>{
 const seeds=JSON.parse(fs.readFileSync(new URL('../src/vehicles/fleetSeeds.json',import.meta.url)));
 for(const id of Object.keys(seeds))for(const tier of ['near','medium','far']){
  assert(VEHICLE_ASSETS[id].lods[tier]);assert.equal(vehicleLodUrl(id,tier),VEHICLE_ASSETS[id].lods[tier]);
 }
 assert.equal(vehicleLodUrl('hornet-quadcopter','far'),vehicleModelUrl('hornet-quadcopter'));
 assert.match(vehicleVariantUrl('big-e','docked'),/\/big-e\/docked.glb$/);
 assert.throws(()=>vehicleModelUrl('unknown'));assert.throws(()=>vehicleModelUrl('constructor'));assert.throws(()=>vehicleVariantUrl('brz','docked'));
});
test('aircraft and fleet preparation manifests point at registered assets',()=>{
 const known=new Set(Object.values(VEHICLE_ASSETS).flatMap(a=>[a.model,...Object.values(a.lods),...Object.values(a.variants)]));
 const flight=JSON.parse(fs.readFileSync(new URL('models/vehicles/flying/manifest.json',publicRoot)));
 for(const model of flight.models)for(const lod of model.lods)assert(known.has(lod.path),lod.path);
 for(const candidate of flight.candidates)assert(known.has(candidate.path),candidate.path);
 const fleet=JSON.parse(fs.readFileSync(new URL('models/vehicles/fleet/manifest.json',publicRoot)));
 for(const ship of Object.values(fleet.ships))for(const lod of ship.lods)assert(known.has(lod.file),lod.file);
});
