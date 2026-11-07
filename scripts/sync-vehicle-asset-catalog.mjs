import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Node/asset-generation tools own the public manifest. Browser code must not
// import from public; use this byte-identical, importable generated mirror.
const source=new URL('../frontend/public/models/vehicles/catalog.json',import.meta.url);
const target=new URL('../frontend/src/vehicles/generated/assetCatalog.json',import.meta.url);
const bytes=await readFile(source);
const catalog=JSON.parse(bytes.toString('utf8'));
if(!catalog.assets||!catalog.groups)throw Error('Invalid vehicle asset catalog');
for(const [id,asset] of Object.entries(catalog.assets)){
 if(!catalog.groups[asset.group]?.includes(asset.subgroup))throw Error(`Invalid vehicle group for ${id}`);
 for(const url of [asset.model,...Object.values(asset.lods??{}),...Object.values(asset.variants??{})]){
  if(typeof url!=='string'||!url.startsWith('/models/vehicles/')||url.includes('..')||!url.endsWith('.glb'))
   throw Error(`Invalid vehicle model URL for ${id}`);
 }
}
if(process.argv.includes('--check')){
 const actual=await readFile(target).catch(()=>null);
 if(!actual?.equals(bytes))throw Error(`Vehicle asset mirror is stale: ${fileURLToPath(target)}. Run node scripts/sync-vehicle-asset-catalog.mjs`);
}else{
 await mkdir(new URL('../frontend/src/vehicles/generated/',import.meta.url),{recursive:true});
 await writeFile(target,bytes);
}
console.log(`Vehicle assets: ${process.argv.includes('--check')?'verified':'synced'} importable catalog`);
