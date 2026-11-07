#!/usr/bin/env node
/** Render the actual runtime Web Audio graph offline, with no external samples.
 * Node 24 + frontend dev dependencies + Chromium/Chrome are required.
 * node scripts/render-vehicle-audio-demo.mjs --out C:/Temp/AvenLab-audio
 * Optional: --chromium "C:/Program Files/Google/Chrome/Application/chrome.exe"
 */
import {createServer} from 'node:http';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {synthesizeVehicleLoop,SAMPLE_RATE} from '../frontend/src/audio/proceduralSamples.ts';
import {PREVIEW_SECTIONS,previewFrame,renderPcmPreview,measurePcmPreview,stereoPcmWave} from './vehicle-audio-pcm-preview.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),outIndex=args.indexOf('--out'),chromeIndex=args.indexOf('--chromium');
if(outIndex<0||!args[outIndex+1])throw Error('Supply --out <output directory>; generated WAV files do not belong in the source tree.');
const out=resolve(args[outIndex+1]),chrome=chromeIndex>=0?args[chromeIndex+1]:(process.env.CHROMIUM_PATH||'chromium');
await mkdir(out,{recursive:true});

function monoWave(samples){
  const wave=Buffer.alloc(44+samples.length*2);
  wave.write('RIFF',0);wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);
  wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);
  wave.writeUInt32LE(SAMPLE_RATE,24);wave.writeUInt32LE(SAMPLE_RATE*2,28);
  wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(samples.length*2,40);
  for(let i=0;i<samples.length;i++)wave.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);
  return wave;
}
for(const kind of ['four','boxer','six','v8','diesel','marine','friction','track','air'])
  await writeFile(join(out,`original-${kind}-loop.wav`),monoWave(synthesizeVehicleLoop(kind)));

if(args.includes('--pcm-preview')){
  const channels=renderPcmPreview(),report=measurePcmPreview(channels);
  await writeFile(join(out,'avenlab-vehicle-audio-preview.wav'),stereoPcmWave(channels));
  await writeFile(join(out,'audio-preview-metrics.json'),JSON.stringify(report,null,2)+'\n');
  if(report.overall.clippedFrames!==0||report.overall.rms<.001||report.sections.at(-1).peak!==0)
    throw Error('Portable preview failed its clipping, audible level or cleanup checks.');
  console.log(JSON.stringify({output:out,...report},null,2));
  process.exit(0);
}
const require=createRequire(join(root,'frontend/package.json')),ts=require('typescript');

// The preview adapter uses OfflineAudioContext, while the exact gameplay engine
// schedules the same source loops, filters, distance panners and smoothed gains.
const page=String.raw`<!doctype html><meta charset="utf-8"><title>AvenLab offline audio render</title><script type="module">
import {createVehicleAudioEngine} from '/audio/vehicleAudioEngine.ts';
import {vehicleAudioProfile} from '/audio/audioProfiles.ts';
import {DEFAULT_VEHICLE_AUDIO} from '/audio/audioSettings.ts';

const rate=24000,duration=20,step=.05;
const context=new OfflineAudioContext(2,rate*duration,rate);
const output=context.createGain(),limiter=context.createDynamicsCompressor();
output.gain.value=DEFAULT_VEHICLE_AUDIO.master;
limiter.threshold.value=-8;limiter.knee.value=12;limiter.ratio.value=8;limiter.attack.value=.003;limiter.release.value=.15;
output.connect(limiter).connect(context.destination);
// A suspended offline renderer is writable; unlike a real paused tab, suspension
// here is only a sample-exact opportunity to update the graph's next 50 ms.
const offline=new Proxy(context,{get(target,key){if(key==='state')return 'running';const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}});
const engine=createVehicleAudioEngine(()=>({context:offline,output}));
const listener={position:[0,1.5,0],forward:[0,0,-1],up:[0,1,0]};
const fixture=${previewFrame.toString()};
const sections=${JSON.stringify(PREVIEW_SECTIONS)};
try{
  let paused=context.suspend(0);
  const rendering=context.startRendering();
  for(let frame=0;frame<duration/step;frame++){
    await paused;
    const data=fixture(frame*step);
    if(data)engine.update([{...data,profile:vehicleAudioProfile(data.vehicle),running:true,rolling:data.speed/32,respawns:0}],listener,DEFAULT_VEHICLE_AUDIO,step,data.echo);
    else engine.silence();
    if(frame+1<duration/step)paused=context.suspend((frame+1)*step);
    await context.resume();
  }
  const rendered=await rendering,channels=[rendered.getChannelData(0),rendered.getChannelData(1)];
  const stats=(start,end)=>{
    let peak=0,sum=0,left=0,right=0,clipped=0;
    const a=Math.floor(start*rate),b=Math.floor(end*rate);
    for(let i=a;i<b;i++){const l=channels[0][i],r=channels[1][i];peak=Math.max(peak,Math.abs(l),Math.abs(r));sum+=l*l+r*r;left+=l*l;right+=r*r;if(Math.abs(l)>=1||Math.abs(r)>=1)clipped++;}
    return {peak,rms:Math.sqrt(sum/((b-a)*2)),leftRms:Math.sqrt(left/(b-a)),rightRms:Math.sqrt(right/(b-a)),clippedFrames:clipped};
  };
  const wav=new ArrayBuffer(44+rendered.length*4),view=new DataView(wav);
  const ascii=(text,offset)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
  ascii('RIFF',0);view.setUint32(4,wav.byteLength-8,true);ascii('WAVEfmt ',8);view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,rate,true);view.setUint32(28,rate*4,true);
  view.setUint16(32,4,true);view.setUint16(34,16,true);ascii('data',36);view.setUint32(40,wav.byteLength-44,true);
  for(let i=0;i<rendered.length;i++)for(let c=0;c<2;c++)view.setInt16(44+i*4+c*2,Math.round(Math.max(-1,Math.min(1,channels[c][i]))*32767),true);
  const report={source:'Original procedural AvenLab waveforms; actual runtime graph rendered with OfflineAudioContext',sampleRate:rate,channels:2,durationSeconds:duration,
    overall:stats(0,duration),sections:sections.map(section=>({...section,...stats(section.start,section.end)})),finalVoices:engine.diagnostics().voices};
  engine.dispose();
  await fetch('/result',{method:'POST',headers:{'Content-Type':'audio/wav','X-Audio-Metrics':JSON.stringify(report)},body:wav});
  document.body.textContent='Rendered successfully';
}catch(error){await fetch('/error',{method:'POST',body:String(error?.stack||error)});}
</script>`;

let resolveResult,rejectResult,chromeLog='';
const result=new Promise((yes,no)=>{resolveResult=yes;rejectResult=no;});
const server=createServer(async(request,response)=>{
  try{
    if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end(page);return;}
    const match=/^\/audio\/([A-Za-z][\w-]*\.ts)$/.exec(request.url||'');
    if(match){
      const file=await readFile(join(root,'frontend/src/audio',match[1]),'utf8');
      response.setHeader('Content-Type','text/javascript');
      response.end(ts.transpileModule(file,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);return;
    }
    if(request.method==='POST'&&(request.url==='/result'||request.url==='/error')){
      const chunks=[];let size=0;
      for await(const chunk of request){size+=chunk.length;if(size>8*1024*1024)throw Error('Preview output exceeded 8 MiB');chunks.push(chunk);}
      const body=Buffer.concat(chunks);
      if(request.url==='/error'){response.end('error');rejectResult(Error(body.toString()));return;}
      const metrics=JSON.parse(request.headers['x-audio-metrics']||'{}');
      await writeFile(join(out,'avenlab-vehicle-audio-preview.wav'),body);
      await writeFile(join(out,'audio-preview-metrics.json'),JSON.stringify(metrics,null,2)+'\n');
      response.end('saved');resolveResult(metrics);return;
    }
    response.writeHead(404);response.end('Not found');
  }catch(error){response.writeHead(500);response.end(String(error));rejectResult(error);}
});
await new Promise(yes=>server.listen(0,'127.0.0.1',yes));
const browserProfile=await mkdtemp(join(tmpdir(),'avenlab-audio-preview-'));
let child,timeout;
try{
  child=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
    `--user-data-dir=${browserProfile}`,`http://127.0.0.1:${server.address().port}`],{stdio:['ignore','ignore','pipe']});
  child.stderr.on('data',chunk=>{chromeLog=(chromeLog+chunk.toString()).slice(-6000);});
  child.once('error',rejectResult);
  child.once('exit',(code,signal)=>rejectResult(Error(`Chromium exited (${code??signal}) before rendering. ${chromeLog}`)));
  timeout=setTimeout(()=>rejectResult(Error('Audio preview timed out after 50 seconds. '+chromeLog)),50000);
  const report=await result;
  if(report.overall.clippedFrames!==0||report.overall.rms<.001||report.sections.at(-1).peak>1e-6||report.finalVoices!==0)
    throw Error('Audio preview did not pass clipping, audible level or session-cleanup checks. Inspect audio-preview-metrics.json.');
  console.log(JSON.stringify({output:out,...report},null,2));
}finally{
  clearTimeout(timeout);child?.kill();server.close();
  // Only this process's explicit mkdtemp browser profile is disposable.
  if(basename(browserProfile).startsWith('avenlab-audio-preview-'))
    await rm(browserProfile,{recursive:true,force:true}).catch(()=>{});
}
