// CPU-only fitting benchmark. Example:
// node scripts/benchmark-wardrobe-fit.mjs --baseline <git-ref> --output /tmp/wardrobe-fit.json
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {createServer} from 'vite';
import {loadWardrobeGeometry} from './load-wardrobe-geometry.mjs';

const frontend=fileURLToPath(new URL('../',import.meta.url)),repo=resolve(frontend,'..');
const option=name=>{const at=process.argv.indexOf(name);return at===-1?undefined:process.argv[at+1];};
const baseline=option('--baseline'),output=option('--output'),samples=Number(option('--samples')??8);
if(!Number.isInteger(samples)||samples<1||samples>100)throw Error('--samples must be between 1 and 100');
const approved=JSON.parse(await readFile(new URL('../tests/fixtures/wardrobe-fit-signatures.json',import.meta.url),'utf8'));
const selected=option('--cases')?.split(',');
const scenarios=approved.cases.filter(sample=>!selected||selected.includes(sample.id));
if(!scenarios.length)throw Error('No benchmark cases selected');
const scenes=new Map();
async function load(path){
  if(!scenes.has(path)){
    const bytes=await readFile(resolve(frontend,'public',path.replace(/^\//,'')));
    if(bytes.toString('ascii',0,4)!=='glTF')throw Error('Materialize the GLB before profiling: '+path);
    scenes.set(path,await loadWardrobeGeometry(bytes));
  }
  return scenes.get(path);
}
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {
  samples:sorted.length,min:sorted[0],median:sorted[Math.floor(sorted.length/2)],max:sorted.at(-1),
  mean:sorted.reduce((a,b)=>a+b,0)/sorted.length,
};};
async function environment(ref){
  const originals=new Map();
  if(ref){
    execFileSync('git',['rev-parse','--verify',ref+'^{commit}'],{cwd:repo,stdio:'ignore'});
    const paths=execFileSync('git',['diff','--name-only',ref,'--','frontend/src'],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(Boolean);
    for(const path of paths){try{originals.set(resolve(repo,path),execFileSync('git',['show',ref+':'+path],{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','ignore']}));}catch{/* New modules have no baseline imports. */}}
  }
  const vite=await createServer({root:frontend,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error',
    optimizeDeps:{noDiscovery:true,include:[]},plugins:[{name:'fit-benchmark-reference',enforce:'pre',transform(code,id){return originals.get(id)??code;}}]});
  const api=Object.assign({},...await Promise.all(['villagerModel','characterCatalog','wardrobe','wardrobeGarments','wardrobeFitCache']
    .map(name=>vite.ssrLoadModule('/src/game/characters/'+name+'.ts'))));
  return {vite,api};
}
async function fixture(env,sample){
  const {api}=env,options={fitted:true,animateFace:true,wetEyes:true},choice={...api.DEFAULT_CHARACTER};let actor;
  if(sample.bundled){
    actor=await load(`models/characters/wardrobe/${sample.bundled}.${sample.tier==='portrait'?'mobile':'garage'}.glb`);
    choice.wardrobe={set:sample.bundled,shirt:'none',waist:'tucked'};
  }else{
    actor=await load(`models/characters/villagers/villager-female/villager-female.${sample.tier}.glb`);
    options.garmentBody=(await load('models/characters/female/wardrobe/vesper-body.glb')).getObjectByName('BODY_WARDROBE');
    choice.garments={skirt:sample.skirt};
    const item=api.getWardrobeGarment(sample.skirt),url=api.wardrobeGarmentModelUrl(item,sample.tier);
    options.garments=[{item,scene:await load(url),authoredFit:url===item.revisionUrl}];
    if(sample.corset){choice.wardrobeTrial={set:sample.corset,shirt:'none',waist:'tucked'};
      options.corsetSource={set:sample.corset,scene:await load(api.corsetModelUrl(choice.wardrobeTrial,sample.tier))};}
  }
  return {api,actor,options,look:api.characterLook(choice)};
}
function run(f,clear){
  if(clear)f.api.wardrobeFitCache.clear();
  const start=performance.now(),model=f.api.prepareVillager(f.actor,f.options),prepared=performance.now();
  try{
    f.api.applyVillagerLook(model,f.look);const applied=performance.now();
    return {prepare:prepared-start,firstApply:applied-prepared,total:applied-start};
  }finally{model.dispose();}
}
const report={metadata:{head:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),baseline,
  current:'Working tree, including uncommitted changes',node:process.version,cpu:os.cpus()[0]?.model,samples,
  statistic:'median is the upper middle sample for even sample counts; min, max, and arithmetic mean are also reported',
  scope:'Synchronous Node CPU fitting with identical preloaded GLB geometry. Warmup excludes asset decode and JIT startup. Cold clears only the bounded fit cache; warm immediately reuses the same look. No GPU/FPS or download measurements.'},cases:[]};
const environments=[];
try{
  const current=await environment();environments.push(current);
  const previous=baseline?await environment(baseline):undefined;if(previous)environments.push(previous);
  for(const sample of scenarios){
    const now=await fixture(current,sample),before=previous?await fixture(previous,sample):undefined;
    run(now,true);run(now,false);if(before){run(before,true);run(before,true);}
    const values={baseline:[],cold:[],warm:[]};
    for(let i=0;i<samples;i++){
      if(before&&i%2===0)values.baseline.push(run(before,true));
      values.cold.push(run(now,true));values.warm.push(run(now,false));
      if(before&&i%2!==0)values.baseline.push(run(before,true));
    }
    const row={id:sample.id,cache:current.api.wardrobeFitCache.stats};
    for(const [key,runs] of Object.entries(values))if(runs.length)row[key]=Object.fromEntries(['prepare','firstApply','total'].map(metric=>[metric,stats(runs.map(run=>run[metric]))]));
    report.cases.push(row);
    console.error(`${sample.id}: baseline ${row.baseline?.prepare.median.toFixed(2)??'-'} ms; cold ${row.cold.prepare.median.toFixed(2)} ms; warm ${row.warm.prepare.median.toFixed(2)} ms; retained ${(row.cache.bytes/1048576).toFixed(2)} MiB`);
    if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n');
  }
  if(!output)console.log(JSON.stringify(report,null,2));
}finally{for(const env of environments)await env.vite.close();}
