import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const source=new URL('../avenlab-server/src/assets/blocks/',import.meta.url),target=new URL('../frontend/public/world-builder/',import.meta.url);
await mkdir(target,{recursive:true});const entries=[];
for(const name of await readdir(source)){
 if(!/^[a-zA-Z0-9_-]+_colliders\.json$/.test(name))continue;
 const bytes=await readFile(new URL(name,source)),doc=JSON.parse(bytes);
 if(doc.schema_version!==2||!doc.map_id||name!==`${doc.map_id}_colliders.json`)continue;
 await writeFile(new URL(name,target),bytes);entries.push({map_id:doc.map_id,file:name,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(new URL('catalog.json',target),JSON.stringify({generated_from:'avenlab-server/src/assets/blocks',maps:entries},null,2)+'\n');
console.log(`World builder: refreshed ${entries.length} map definition(s) in ${fileURLToPath(target)}`);
