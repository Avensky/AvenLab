import {peekVehicleAudio,smoothAudioParam,type SharedVehicleAudio} from './sharedAudio.ts';
import {synthesizeVehicleLoop,SAMPLE_RATE,type ProceduralSample} from './proceduralSamples.ts';
import type {VehicleAudioSettings} from './audioSettings.ts';
import type {VehicleSoundState,AudioPoint} from './vehicleSoundModel.ts';

export type AudioListenerPose={position:AudioPoint;forward:AudioPoint;up:AudioPoint};
type Voice={
  family:string; mixer:GainNode; panner:PannerNode; distance:BiquadFilterNode; wet:GainNode;
  engine:AudioBufferSourceNode; exhaust:BiquadFilterNode; intake:BiquadFilterNode;
  idle:GainNode; load:GainNode; texture:AudioBufferSourceNode; surface:BiquadFilterNode; surfaceGain:GainNode;
  turbine:OscillatorNode; turbineFilter:BiquadFilterNode; turbineGain:GainNode; air:AudioBufferSourceNode; airGain:GainNode;
  nodes:AudioNode[]; sources:(AudioBufferSourceNode|OscillatorNode)[];
  spool:number; burst:number; previousLoad:number; previousGear:number; respawns:number;
};
type Graph={context:AudioContext;mix:GainNode;echo:DelayNode;echoFilter:BiquadFilterNode;feedback:GainNode;echoReturn:GainNode};
const normalized=(value:number)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;

/** Native Web Audio graph: no sample processing in JavaScript after allocation,
 * no download/decode on the driving path and at most six reusable vehicle voices.
 * Engine envelopes follow server telemetry; sounds never modify simulation. */
export function createVehicleAudioEngine(getRuntime:()=>SharedVehicleAudio|null=peekVehicleAudio){
  const voices=new Map<string,Voice>(),buffers=new Map<ProceduralSample,AudioBuffer>();
  let graph:Graph|null=null,bufferContext:AudioContext|null=null;

  const buffer=(context:AudioContext,kind:ProceduralSample)=>{
    if(bufferContext!==context){buffers.clear();bufferContext=context;}
    let value=buffers.get(kind);
    if(!value){
      const samples=synthesizeVehicleLoop(kind),created=context.createBuffer(1,samples.length,SAMPLE_RATE);
      created.copyToChannel(samples,0);buffers.set(kind,created);value=created;
    }
    return value;
  };
  const releaseVoice=(id:string)=>{
    const voice=voices.get(id);if(!voice)return;
    for(const source of voice.sources){try{source.stop();}catch{/* already ended */}}
    for(const node of voice.nodes)node.disconnect();
    voices.delete(id);
  };
  const releaseGraph=()=>{
    for(const id of voices.keys())releaseVoice(id);
    if(!graph)return;
    for(const node of [graph.mix,graph.echo,graph.echoFilter,graph.feedback,graph.echoReturn])node.disconnect();
    graph=null;
  };
  const init=(runtime:SharedVehicleAudio)=>{
    if(graph?.context===runtime.context)return graph;
    releaseGraph();
    const context=runtime.context,mix=context.createGain(),echo=context.createDelay(1),
      echoFilter=context.createBiquadFilter(),feedback=context.createGain(),echoReturn=context.createGain();
    mix.gain.value=0;mix.connect(runtime.output);
    echo.delayTime.value=.14;echoFilter.type='lowpass';echoFilter.frequency.value=2900;
    feedback.gain.value=.2;echoReturn.gain.value=.5;
    echo.connect(echoFilter);echoFilter.connect(feedback).connect(echo);
    echoFilter.connect(echoReturn).connect(mix);
    graph={context,mix,echo,echoFilter,feedback,echoReturn};return graph;
  };
  const makeVoice=(state:VehicleSoundState,g:Graph)=>{
    const c=g.context,nodes:AudioNode[]=[],sources:(AudioBufferSourceNode|OscillatorNode)[]=[];
    const gain=()=>{const n=c.createGain();n.gain.value=0;nodes.push(n);return n;};
    const filter=(type:BiquadFilterType)=>{const n=c.createBiquadFilter();n.type=type;nodes.push(n);return n;};
    const source=(kind:ProceduralSample)=>{
      const n=c.createBufferSource();n.buffer=buffer(c,kind);n.loop=true;nodes.push(n);sources.push(n);return n;
    };
    const mixer=gain(),panner=c.createPanner(),distance=filter('lowpass'),wet=gain();
    nodes.push(panner);mixer.gain.value=1;distance.frequency.value=15000;
    panner.panningModel='equalpower';panner.distanceModel='inverse';
    panner.refDistance=state.profile.referenceDistance;panner.maxDistance=250;panner.rolloffFactor=1.15;
    mixer.connect(distance).connect(panner);panner.connect(g.mix);panner.connect(wet).connect(g.echo);
    const engine=source(state.profile.family),exhaust=filter('lowpass'),intake=filter('bandpass'),idle=gain(),load=gain();
    intake.frequency.value=1400;intake.Q.value=.7;exhaust.Q.value=.7;
    engine.connect(exhaust).connect(idle).connect(mixer);
    engine.connect(intake).connect(load).connect(mixer);
    const texture=source(state.profile.tracks?'track':state.profile.marine?'air':'friction'),
      surface=filter('bandpass'),surfaceGain=gain();
    texture.connect(surface).connect(surfaceGain).connect(mixer);
    const turbine=c.createOscillator(),turbineFilter=filter('lowpass'),turbineGain=gain();nodes.push(turbine);sources.push(turbine);
    turbine.type='sine';turbine.frequency.value=800;turbineFilter.frequency.value=3200;turbineFilter.Q.value=.7;turbine.connect(turbineFilter).connect(turbineGain).connect(mixer);
    const air=source('air'),airFilter=filter('highpass'),airGain=gain();
    airFilter.frequency.value=1600;air.connect(airFilter).connect(airGain).connect(mixer);
    for(const s of sources)s.start();
    const voice:Voice={family:state.profile.family,mixer,panner,distance,wet,engine,exhaust,intake,idle,load,
      texture,surface,surfaceGain,turbine,turbineFilter,turbineGain,air,airGain,nodes,sources,spool:0,burst:0,
      previousLoad:state.load,previousGear:state.gear,respawns:state.respawns};
    voices.set(state.id,voice);return voice;
  };
  const positionPanner=(panner:PannerNode,position:AudioPoint,now:number)=>{
    if(panner.positionX){
      smoothAudioParam(panner.positionX,position[0],now,.035);
      smoothAudioParam(panner.positionY,position[1],now,.035);
      smoothAudioParam(panner.positionZ,position[2],now,.035);
    }else panner.setPosition(...position);
  };
  const positionListener=(listener:AudioListener,pose:AudioListenerPose,now:number)=>{
    if(listener.positionX){
      for(const [parameter,value] of [
        [listener.positionX,pose.position[0]],[listener.positionY,pose.position[1]],[listener.positionZ,pose.position[2]],
        [listener.forwardX,pose.forward[0]],[listener.forwardY,pose.forward[1]],[listener.forwardZ,pose.forward[2]],
        [listener.upX,pose.up[0]],[listener.upY,pose.up[1]],[listener.upZ,pose.up[2]],
      ] as [AudioParam,number][])smoothAudioParam(parameter,value,now,.035);
    }else{listener.setPosition(...pose.position);listener.setOrientation(...pose.forward,...pose.up);}
  };
  return {
    update(states:readonly VehicleSoundState[],listener:AudioListenerPose,settings:VehicleAudioSettings,delta=.05,enclosure=0){
      const runtime=getRuntime();
      if(!runtime||runtime.context.state!=='running'||!settings.enabled||settings.master<=0){releaseGraph();return;}
      const selected=states.filter(s=>s.running||s.rolling>.01||s.slip>.01).slice(0,Math.min(6,settings.maxVoices));
      if(!selected.length){releaseGraph();return;}
      const g=init(runtime),now=g.context.currentTime,dt=Math.min(.2,Math.max(.01,delta));
      const wanted=new Set(selected.map(s=>s.id));
      // Release old slots before allocating any replacement: the cap is hard.
      for(const id of voices.keys())if(!wanted.has(id))releaseVoice(id);
      positionListener(g.context.listener,listener,now);
      smoothAudioParam(g.mix.gain,1,now,.05);
      for(const state of selected){
        if(!wanted.has(state.id))continue;
        if(voices.get(state.id)?.family!==state.profile.family)releaseVoice(state.id);
        const v=voices.get(state.id)??makeVoice(state,g);
        if(v.respawns!==state.respawns){v.spool=0;v.burst=0;v.previousLoad=state.load;v.previousGear=state.gear;v.respawns=state.respawns;}
        const distance=Math.hypot(state.position[0]-listener.position[0],state.position[1]-listener.position[1],state.position[2]-listener.position[2]);
        const location:AudioPoint=settings.spatial?state.position:[
          listener.position[0]+listener.forward[0]*distance,
          listener.position[1]+listener.forward[1]*distance,
          listener.position[2]+listener.forward[2]*distance,
        ];
        positionPanner(v.panner,location,now);
        smoothAudioParam(v.distance.frequency,Math.max(850,15000/(1+distance*.035)),now,.12);
        const throttle=normalized(state.load),running=state.running?1:0;
        smoothAudioParam(v.engine.playbackRate,Math.max(.2,Math.min(8,state.rpm/state.profile.baseRpm)),now,.05);
        smoothAudioParam(v.idle.gain,running*settings.engines*(.1+throttle*.06),now);
        smoothAudioParam(v.load.gain,running*settings.engines*throttle*.14,now);
        smoothAudioParam(v.exhaust.frequency,(state.profile.marine?360:state.profile.tracks?650:900)+throttle*4200,now);
        smoothAudioParam(v.intake.frequency,650+state.rpm*.32,now);
        const surfaceLevel=state.profile.tracks?state.rolling*settings.tracks*.16:
          state.profile.marine?state.rolling*settings.tracks*.07:
          (state.rolling*.018+state.slip*.12)*settings.tires;
        smoothAudioParam(v.surfaceGain.gain,surfaceLevel,now);
        smoothAudioParam(v.texture.playbackRate,state.profile.tracks ? .35+state.speed/6 : 1,now,.1);
        smoothAudioParam(v.surface.frequency,state.profile.tracks?750+state.speed*25:450+state.slip*2000+state.speed*12,now);
        smoothAudioParam(v.surface.Q,state.profile.tracks?1.2:1+state.slip*5,now);
        const spoolTarget=state.profile.turbo&&state.running?normalized((state.rpm-1400)/4500)*throttle:0;
        v.spool+=(spoolTarget-v.spool)*(1-Math.exp(-dt/(spoolTarget>v.spool ? .38 : .20)));
        const release=(v.previousLoad>.55&&throttle<.2)||(v.previousGear!==state.gear);
        if(release&&v.spool>.25&&state.running)v.burst=Math.max(v.burst,v.spool*.8);
        else v.burst*=Math.exp(-dt/.22);
        v.previousLoad=throttle;v.previousGear=state.gear;
        smoothAudioParam(v.turbine.frequency,800+v.spool*3600,now,.14);
        smoothAudioParam(v.turbineFilter.frequency,2300+v.spool*1000,now,.16);
        smoothAudioParam(v.turbineGain.gain,state.profile.turbo?v.spool*settings.turbo*.021:0,now,.08);
        smoothAudioParam(v.airGain.gain,(state.boost?settings.nitrous*.085:0)+v.burst*settings.turbo*.13,now,.025);
        smoothAudioParam(v.wet.gain,settings.echo*(.025+normalized(enclosure)*.6),now,.25);
      }
    },
    // Menus, stale snapshots, world changes and hidden tabs all release loop
    // sources and delay tails. Nothing old resumes when the session returns.
    silence:releaseGraph,
    dispose(){releaseGraph();buffers.clear();bufferContext=null;},
    diagnostics(){return {voices:voices.size,buffers:buffers.size,graph:graph!==null};},
  };
}
