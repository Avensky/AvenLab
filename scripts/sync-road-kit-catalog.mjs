import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// The public copy is the authored source for GLB/physics generation. Keeping
// a mirrored src import avoids Vite's intentionally forbidden public imports.
const source=new URL('../frontend/public/models/roads/catalog.json',import.meta.url);
const target=new URL('../frontend/src/worldBuilder/mapKit/generated/catalog.json',import.meta.url);
const bytes=await readFile(source);
if(process.argv.includes('--check')){
 const actual=await readFile(target).catch(()=>null);
 if(!actual?.equals(bytes))throw Error(`Stale road kit mirror: ${fileURLToPath(target)}. Run node scripts/sync-road-kit-catalog.mjs`);
}else{
 await mkdir(new URL('../frontend/src/worldBuilder/mapKit/generated/',import.meta.url),{recursive:true});
 await writeFile(target,bytes);
}
console.log(`Road kit: ${process.argv.includes('--check')?'verified':'synced'} importable catalog`);
