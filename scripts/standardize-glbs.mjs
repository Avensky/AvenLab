import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {standardizeGlb} from './lib/glb-components.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outputArg=process.argv.indexOf('--output');
if(outputArg<0||!process.argv[outputArg+1])throw Error('Usage: node scripts/standardize-glbs.mjs --output <new-directory>');
const output=path.resolve(process.argv[outputArg+1]);
if(fs.existsSync(output))throw Error('Choose a new output directory; existing assets are never overwritten');
const paths=execFileSync('git',['ls-files','*.glb'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
const records=[];fs.mkdirSync(output,{recursive:true});
for(const source of paths){
 try{
  const input=fs.readFileSync(path.join(root,source)),result=standardizeGlb(input,source);
  const destination=path.join(output,source);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,result.bytes);
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  records.push({source,status:'standardized',source_sha256:hash(input),output_sha256:hash(result.bytes),nodes:result.report.components.length,needs_review:result.report.review});
 }catch(error){records.push({source,status:'unavailable',reason:error.message});}
}
fs.writeFileSync(path.join(output,'component-report.json'),JSON.stringify({schema:1,records},null,2)+'\n');
console.log(JSON.stringify({standardized:records.filter(r=>r.status==='standardized').length,unavailable:records.filter(r=>r.status!=='standardized').length,output}));
if(records.some(r=>r.status!=='standardized'))process.exitCode=2;
