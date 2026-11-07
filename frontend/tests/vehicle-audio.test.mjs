import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_VEHICLE_AUDIO,sanitizeVehicleAudio} from '../src/audio/audioSettings.ts';
import {vehicleAudioProfile,hasVehicleAudioProfile} from '../src/audio/audioProfiles.ts';
import {synthesizeVehicleLoop,SAMPLE_RATE} from '../src/audio/proceduralSamples.ts';
import {projectVehicleSound,selectAudibleVehicles,createVehicleSoundProjector} from '../src/audio/vehicleSoundModel.ts';
import {createVehicleAudioEngine} from '../src/audio/vehicleAudioEngine.ts';
import {tunnelReverbAt} from '../src/audio/audioEnvironment.ts';
import {VehicleFlags} from '../src/store/input/protocol/inputMasks.ts';
import {renderPcmPreview,measurePcmPreview,stereoPcmWave} from '../../scripts/vehicle-audio-pcm-preview.mjs';

const entity=(id='me',extra={})=>({id,vehicle_id:'skyline34',position:[0,0,0],rotation:[0,0,0,1],
  speed:12,rpm:3000,gear:2,engine_torque:300,vehicle_mask:VehicleFlags.ENGINE_ON,
  collider:{wheel_radius:.3},wheels:[{grounded:true,wheel_speed:40}],
  health:{defeated:false,stats:{respawns:0}},...extra});

test('vehicle sound settings are finite, bounded and independently mutable',()=>{
  const value=sanitizeVehicleAudio({master:99,tires:-4,engines:NaN,echo:Infinity,maxVoices:100,enabled:false});
  assert.equal(value.master,1);assert.equal(value.tires,0);
  assert.equal(value.engines,DEFAULT_VEHICLE_AUDIO.engines);
  assert.equal(value.echo,DEFAULT_VEHICLE_AUDIO.echo);
  assert.equal(value.maxVoices,4);assert.equal(value.enabled,false);
  value.engines=0;
  assert.equal(DEFAULT_VEHICLE_AUDIO.engines,.8);
});

test('original loop generation is deterministic, finite, DC-free and bounded',()=>{
  for(const family of ['four','boxer','six','v8','diesel','marine','track','friction','air']){
    const loop=synthesizeVehicleLoop(family),again=synthesizeVehicleLoop(family);
    assert.equal(loop.length,SAMPLE_RATE);assert.deepEqual(loop,again);
    let peak=0,mean=0,energy=0;
    for(const x of loop){assert.ok(Number.isFinite(x));peak=Math.max(peak,Math.abs(x));mean+=x;energy+=x*x;}
    assert.ok(peak<1,`${family} must not clip`);
    assert.ok(Math.abs(mean/loop.length)<1e-7,`${family} DC mean`);
    assert.ok(energy/loop.length>.001,`${family} must not be silent`);
    assert.ok(Math.abs(loop[0]-loop.at(-1))<.08,`${family} wrap seam`);
  }
});

test('sound families distinguish car, tank and fleet, while aircraft do not become car engines',()=>{
  assert.equal(vehicleAudioProfile('charger70').family,'v8');
  assert.equal(vehicleAudioProfile('tank').tracks,true);
  assert.equal(vehicleAudioProfile('burke').marine,true);
  assert.equal(hasVehicleAudioProfile('apache-ah64'),false);
  assert.equal(hasVehicleAudioProfile('unknown-uninstalled-model'),false);
});

test('nearest selection is hard-capped, local-first, bounded by distance and stable near cutoff',()=>{
  const fleet=Array.from({length:100},(_,i)=>entity(String(i),{position:[i*8,0,0]}));
  fleet.push(entity('me',{position:[250,0,0]}));
  const picked=selectAudibleVehicles(fleet,[0,0,0],'me',4);
  assert.deepEqual(picked.map(x=>x.entity.id),['me','0','1','2']);
  assert.equal(selectAudibleVehicles(fleet,[0,0,0],null,100).length,6);
  assert.equal(selectAudibleVehicles(fleet,[NaN,0,0],null,4).length,0);
  assert.equal(selectAudibleVehicles([entity('dead',{health:{defeated:true}})],[0,0,0],null,4).length,0);
  assert.equal(selectAudibleVehicles([entity('jet',{vehicle_id:'f16'})],[0,0,0],null,4).length,0);
  const parked=Array.from({length:8},(_,i)=>entity('parked-'+i,{speed:0,vehicle_mask:0,position:[i,0,0]}));
  assert.deepEqual(selectAudibleVehicles([...parked,entity('audible',{position:[12,0,0]})],[0,0,0],null,2).map(x=>x.entity.id),['audible']);
  const retained=new Set(['old']);
  assert.equal(selectAudibleVehicles([entity('new',{position:[10,0,0]}),entity('old',{position:[11,0,0]})],
    [0,0,0],null,1,retained)[0].entity.id,'old');
});

test('grounded rad/s wheels drive conservative tire cues, airborne/tank/marine do not squeal',()=>{
  assert.equal(projectVehicleSound(entity()).slip,0);
  assert.ok(projectVehicleSound(entity('slip',{wheels:[{grounded:true,wheel_speed:90}]})).slip>.5);
  assert.equal(projectVehicleSound(entity('air',{wheels:[{grounded:false,wheel_speed:200}]})).slip,0);
  assert.equal(projectVehicleSound(entity('tank',{vehicle_id:'tank',wheels:[{grounded:true,wheel_speed:200}]})).slip,0);
  assert.equal(projectVehicleSound(entity('boat',{vehicle_id:'hawaii-rescue',wheels:[]})).slip,0);
  assert.equal(projectVehicleSound(entity('off',{vehicle_mask:0})).running,false);
  assert.equal(projectVehicleSound(entity('boost',{vehicle_mask:VehicleFlags.ENGINE_ON|VehicleFlags.BOOST})).boost,true);
});

test('snapshot-clock projector preserves drift between receipts and drops respawn/teleport derivatives',()=>{
  const project=createVehicleSoundProjector();
  project.project(entity(),1);
  const drifting=entity('me',{position:[.7,0,.4]});
  const first=project.project(drifting,1.05,{throttle:.9,brake:0});
  assert.ok(first.slip>.5);
  const repeated=project.project(drifting,1.05,{throttle:.1,brake:0});
  assert.equal(repeated.slip,first.slip,'same receipt preserves sound envelope');
  assert.equal(repeated.load,.1,'local input still changes engine load');
  const respawned=entity('me',{position:[120,0,20],health:{defeated:false,stats:{respawns:1}}});
  assert.equal(project.project(respawned,1.1).slip,0);
  const teleport=entity('me',{position:[250,0,20],health:{defeated:false,stats:{respawns:1}}});
  assert.equal(project.project(teleport,1.15).slip,0);
  project.clear();
  assert.equal(project.project(drifting,2).slip,0);
});

test('tunnel echo uses bounded authored volumes and does not leak outside or above roof',()=>{
  const map={cell:[100,100],layout:{kind:'fixed_grid',origin:[2,-1]},authored_layout:{objects:[
    {id:'tunnel',piece:'urban-tunnel-shell',position:[0,10,0],size:[16,8,32],yaw:90},
  ]}};
  assert.equal(tunnelReverbAt(map,[210,12,-100]),1);
  assert.equal(tunnelReverbAt(map,[200,12,-110]),0);
  assert.equal(tunnelReverbAt(map,[200,25,-100]),0);
  assert.equal(tunnelReverbAt(null,[0,0,0]),0);
});

function fakeAudio(){
  const nodes=[],sources=[],parameters=[];
  const parameter=()=>{
    const p={value:0,events:[],cancelScheduledValues(){this.events=[];},setValueAtTime(v){this.value=v;this.events.push(v);},
      setTargetAtTime(v){this.value=v;this.events.push(v);}};
    parameters.push(p);return p;
  };
  const node=(kind)=>{
    const n={kind,disconnected:false,connections:[],connect(other){this.connections.push(other);return other;},disconnect(){this.disconnected=true;}};
    nodes.push(n);return n;
  };
  const spatial=()=>Object.fromEntries(['positionX','positionY','positionZ','forwardX','forwardY','forwardZ','upX','upY','upZ'].map(k=>[k,parameter()]));
  const source=kind=>{const n={...node(kind),frequency:parameter(),playbackRate:parameter(),stops:0,starts:0,
    start(){this.starts++;},stop(){this.stops++;}};sources.push(n);return n;};
  const context={state:'running',currentTime:0,listener:spatial(),
    createGain:()=>({...node('gain'),gain:parameter()}),
    createDelay:()=>({...node('delay'),delayTime:parameter()}),
    createPanner:()=>({...node('panner'),...spatial()}),
    createBiquadFilter:()=>({...node('filter'),frequency:parameter(),Q:parameter()}),
    createBufferSource:()=>source('buffer'),createOscillator:()=>source('oscillator'),
    createBuffer:(_channels,length,rate)=>({length,sampleRate:rate,copyToChannel(){}}),
  };
  return {context,output:context.createGain(),nodes,sources,parameters};
}

const ear={position:[0,0,0],forward:[0,0,-1],up:[0,1,0]};
test('native graph keeps four sources per voice and no allocations/automation growth while driving',()=>{
  const runtime=fakeAudio(),audio=createVehicleAudioEngine(()=>runtime);
  const fleet=Array.from({length:30},(_,i)=>projectVehicleSound(entity(String(i),{position:[i,0,0]})));
  audio.update(fleet,ear,DEFAULT_VEHICLE_AUDIO);
  assert.equal(audio.diagnostics().voices,4);assert.equal(runtime.sources.length,16);
  const nodeCount=runtime.nodes.length,bufferCount=audio.diagnostics().buffers;
  for(let i=1;i<200;i++){
    runtime.context.currentTime=i*.05;
    audio.update(fleet,ear,DEFAULT_VEHICLE_AUDIO);
  }
  assert.equal(runtime.nodes.length,nodeCount);assert.equal(audio.diagnostics().buffers,bufferCount);
  assert.ok(runtime.parameters.every(p=>p.events.length<=2),'AudioParam schedules are replaced, never appended');
  audio.update(fleet.slice(4),ear,{...DEFAULT_VEHICLE_AUDIO,maxVoices:6});
  assert.equal(audio.diagnostics().voices,6);
  assert.ok(runtime.sources.slice(0,16).every(s=>s.stops===1),'old voices are released before new ones');
  audio.silence();
  assert.deepEqual(audio.diagnostics(),{voices:0,buffers:bufferCount,graph:false});
  assert.ok(runtime.sources.every(s=>s.stops===1));
  audio.dispose();assert.equal(audio.diagnostics().buffers,0);
});

test('mute, engine off and suspended contexts stop all loop voices and echo tails',()=>{
  const runtime=fakeAudio(),audio=createVehicleAudioEngine(()=>runtime);
  const state=projectVehicleSound(entity());
  audio.update([state],ear,DEFAULT_VEHICLE_AUDIO);
  audio.update([state],ear,{...DEFAULT_VEHICLE_AUDIO,master:0});
  assert.equal(audio.diagnostics().voices,0);assert.equal(audio.diagnostics().graph,false);
  audio.update([state],ear,DEFAULT_VEHICLE_AUDIO);
  runtime.context.state='suspended';audio.update([state],ear,DEFAULT_VEHICLE_AUDIO);
  assert.equal(audio.diagnostics().voices,0);assert.equal(audio.diagnostics().graph,false);
  runtime.context.state='running';
  audio.update([{...state,running:false,rolling:0,slip:0}],ear,DEFAULT_VEHICLE_AUDIO);
  assert.equal(audio.diagnostics().voices,0);
  audio.dispose();assert.ok(runtime.sources.every(s=>s.stops===1));
});

test('turbo release uses a reusable air voice and respawn clears its old burst',()=>{
  const runtime=fakeAudio(),audio=createVehicleAudioEngine(()=>runtime);
  const state={...projectVehicleSound(entity()),rpm:6000,load:.95};
  for(let i=0;i<30;i++){runtime.context.currentTime=i*.05;audio.update([state],ear,DEFAULT_VEHICLE_AUDIO);}
  const turbine=runtime.sources.find(s=>s.kind==='oscillator');
  assert.ok(turbine.frequency.value>4000);
  const air=runtime.sources[3],airGain=air.connections[0].connections[0].gain;
  assert.equal(airGain.value,0);
  audio.update([{...state,load:.05,gear:3}],ear,DEFAULT_VEHICLE_AUDIO);
  assert.ok(airGain.value>0,'throttle lift produces a short burst');
  assert.equal(runtime.sources.length,4,'blow-off cannot allocate extra sources');
  audio.update([{...state,load:0,respawns:1}],ear,DEFAULT_VEHICLE_AUDIO);
  assert.equal(airGain.value,0,'old burst cannot survive a respawn');
  audio.update([{...state,load:0,respawns:1,boost:true}],ear,DEFAULT_VEHICLE_AUDIO);
  assert.ok(airGain.value>0,'nitrous reuses the existing air source');
  audio.dispose();
});

test('portable audio audition is deterministic stereo, unclipped and silent after session cleanup',()=>{
  const channels=renderPcmPreview(),metrics=measurePcmPreview(channels),wav=stereoPcmWave(channels);
  assert.equal(channels[0].length,20*SAMPLE_RATE);
  assert.ok(metrics.overall.rms>.001);assert.equal(metrics.overall.clippedFrames,0);
  assert.equal(metrics.sections.at(-1).peak,0);
  assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt16LE(22),2);
  const power=(channel,start,end)=>{
    let sum=0;for(let i=start*SAMPLE_RATE;i<end*SAMPLE_RATE;i++)sum+=channels[channel][i]**2;return sum;
  };
  assert.ok(power(0,15,16)>power(1,15,16)*2,'approaching source begins on the left');
  assert.ok(power(1,17,18)>power(0,17,18)*2,'departing source ends on the right');
  assert.ok(power(0,16,17)+power(1,16,17)>power(0,15,16)+power(1,15,16),'nearby drive-by is louder than distant');
});
