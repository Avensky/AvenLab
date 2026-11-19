// Compare the initial static JavaScript closure using the same installed assets
// and Vite configuration. Public binaries are not regenerated or copied.
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rm, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {build} from 'vite';

const frontend=fileURLToPath(new URL('../',import.meta.url)),repo=resolve(frontend,'..');
const option=name=>{const at=process.argv.indexOf(name);return at===-1?undefined:process.argv[at+1];};
const baseline=option('--baseline'),output=option('--output');
if(!baseline||!output)throw Error('Use --baseline <git-ref> --output <report.json>');
execFileSync('git',['rev-parse','--verify',baseline+'^{commit}'],{cwd:repo,stdio:'ignore'});
const originals=new Map();
const paths=execFileSync('git',['diff','--name-only',baseline,'--','frontend/src','packages'],{cwd:repo,encoding:'utf8'})
  .trim().split('\n').filter(path=>/\.(tsx?|jsx?|json)$/.test(path));
for(const path of paths){
  try { originals.set(resolve(repo,path),execFileSync('git',['show',baseline+':'+path],{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','ignore']})); }
  catch { /* A new module has no imports in the baseline source graph. */ }
}
const temporary=await mkdtemp(resolve(tmpdir(),'avenlab-bundle-'));
async function measure(name,restore){
 const outDir=resolve(temporary,name);
 await build({root:frontend,plugins:restore?[{
  name:'audit-baseline-source',enforce:'pre',
  transform(source,id){return originals.get(id.split('?')[0])??source;},
 }]:[],build:{outDir,emptyOutDir:true,copyPublicDir:false,manifest:true}});
 const manifest=JSON.parse(await readFile(resolve(outDir,'.vite/manifest.json'),'utf8'));
 const entry=manifest['index.html'];
 if(!entry)throw Error('The game entry is missing from the Vite manifest');
 const seen=new Set(),files=[];
 async function visit(key){
  if(seen.has(key))return;seen.add(key);
  const item=manifest[key];if(!item)throw Error('Missing manifest dependency '+key);
  const bytes=await readFile(resolve(outDir,item.file));
  files.push({path:item.file,bytes:bytes.length,gzipBytes:gzipSync(bytes).length});
  for(const dependency of item.imports??[])await visit(dependency);
 }
 await visit('index.html');
 const optional={};
 for(const key of ['src/game/alpha/HeroSelection.tsx','src/game/heroes/HeroWorkshop.tsx']){
  const item=manifest[key];
  if(item){const bytes=await readFile(resolve(outDir,item.file));optional[key]={path:item.file,bytes:bytes.length,gzipBytes:gzipSync(bytes).length,inInitialClosure:seen.has(key)};}
 }
 return {initialJavaScriptBytes:files.reduce((sum,item)=>sum+item.bytes,0),initialJavaScriptGzipBytes:files.reduce((sum,item)=>sum+item.gzipBytes,0),files,optional};
}
try {
 const before=await measure('baseline',true),after=await measure('current',false);
 const report={baseline,method:'Same current Vite configuration and installed public assets; baseline source restored before transforms. Static import closure of index.html; Node zlib default gzip. No transfer/FPS measurements.',before,after};
 await mkdir(dirname(resolve(output)),{recursive:true});
 await writeFile(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({output,before:before.initialJavaScriptGzipBytes,after:after.initialJavaScriptGzipBytes}));
}finally{await rm(temporary,{recursive:true,force:true});}
