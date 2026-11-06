import {readdir,readFile,mkdir,writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseMapDocument} from '../frontend/src/worldBuilder/document/mapDocument.ts';
import {createHash} from 'node:crypto';
const source=new URL('../avenlab-server/src/assets/blocks/',import.meta.url),target=new URL('../frontend/public/world-builder/',import.meta.url);
const checking=process.argv.includes('--check');
async function syncedWrite(location,bytes){
 if(!checking){await writeFile(location,bytes);return;}
 const actual=await readFile(location).catch(()=>null);
 const expected=typeof bytes==='string'?Buffer.from(bytes):bytes;
 if(!actual?.equals(expected))throw Error(`World catalog is stale: ${fileURLToPath(location)}. Run node scripts/sync-world-builder-map.mjs`);
}
if(!checking)await mkdir(target,{recursive:true});const entries=[];
for(const name of (await readdir(source)).sort()){
 if(!/^[a-zA-Z0-9_-]+_colliders\.json$/.test(name))continue;
 const bytes=await readFile(new URL(name,source)),doc=JSON.parse(bytes);
 if(doc.schema_version!==2||!doc.map_id||name!==`${doc.map_id}_colliders.json`)continue;
 parseMapDocument(doc);
 await syncedWrite(new URL(name,target),bytes);entries.push({map_id:doc.map_id,name:doc.metadata?.name || doc.authored_layout?.title || doc.metadata?.title || doc.map_id.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()),desc:doc.metadata?.description || 'Installed server environment',file:name,sha256:createHash('sha256').update(bytes).digest('hex')});
}
if(!entries.length)throw Error('No valid schema-2 maps installed');
await syncedWrite(new URL('catalog.json',target),JSON.stringify({generated_from:'avenlab-server/src/assets/blocks',maps:entries},null,2)+'\n');
console.log(`World builder: ${checking?'verified':'refreshed'} ${entries.length} map definition(s) in ${fileURLToPath(target)}`);

const catalog=entries.map(m=>({id:m.map_id,name:m.name,desc:m.desc}));
if(!checking)await mkdir(new URL('../frontend/src/store/selection/generated/',import.meta.url),{recursive:true});
await syncedWrite(new URL('../frontend/src/store/selection/generated/maps.json',import.meta.url),JSON.stringify(catalog,null,2)+'\n');

const retained=new Set(entries.map(m=>m.file));
for(const file of await readdir(target)) if(/^[a-zA-Z0-9_-]+_colliders\.json$/.test(file)&&!retained.has(file)){
 if(checking)throw Error(`Removed world is still published: ${file}`);
 await unlink(new URL(file,target));
}
