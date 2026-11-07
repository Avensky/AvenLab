/** Portable audition of the original waveforms. This is deliberately a small
 * approximate offline mixer, not a replacement for native Web Audio validation. */
import {synthesizeVehicleLoop,SAMPLE_RATE} from '../frontend/src/audio/proceduralSamples.ts';
import {vehicleAudioProfile} from '../frontend/src/audio/audioProfiles.ts';
import {DEFAULT_VEHICLE_AUDIO} from '../frontend/src/audio/audioSettings.ts';

export const PREVIEW_SECONDS=20;
export const PREVIEW_SECTIONS=[
  {name:'Four-cylinder idle and throttle',start:.4,end:2},
  {name:'Inline-six acceleration and turbo spool',start:2.3,end:5.5},
  {name:'Throttle-lift blow-off',start:5.5,end:6.1},
  {name:'Nitrous flow with engine',start:6.2,end:7.5},
  {name:'Tank engine and moving tracks',start:8.2,end:10.4},
  {name:'Grounded tire friction',start:10.7,end:12.4},
  {name:'Authored tunnel echo',start:12.7,end:14.4},
  {name:'Stereo drive-by and distance rolloff',start:14.7,end:18.3},
  {name:'Session cleanup silence',start:19,end:20},
];

// Kept self-contained so the native render harness can embed the same fixture.
export function previewFrame(t){
  const frame=(id,vehicle,rpm,load,speed=0,extra={})=>({id,vehicle,rpm,load,speed,slip:0,boost:false,gear:2,position:[0,0,-4],echo:0,...extra});
  if(t<2)return frame('car','ae86',850+Math.max(0,t-.6)*650,.12+Math.max(0,t-.6)*.25);
  if(t<8)return frame('turbo','skyline34',t<5.5?1800+(t-2)*1200:4800,t<5.5 ? .85 : t<6.2 ? .05 : .95,22,
    {boost:t>=6.2&&t<7.5,gear:t<5.5?2:3});
  if(t<10.5)return frame('tank','tank',1100+(t-8)*180,.6,10);
  if(t<12.5)return frame('tires','charger70',3400,.4,18,{slip:.85});
  if(t<14.5)return frame('tunnel','skyline34',3600,.7,21,{echo:1});
  if(t<18.5)return frame('pass','charger70',4200,.8,28,{position:[(t-16.5)*50,0,-6]});
  return null;
}

export function renderPcmPreview(){
  const rate=SAMPLE_RATE,settings=DEFAULT_VEHICLE_AUDIO,length=rate*PREVIEW_SECONDS;
  const channels=[new Float32Array(length),new Float32Array(length)],buffers=new Map();
  const get=kind=>{if(!buffers.has(kind))buffers.set(kind,synthesizeVehicleLoop(kind));return buffers.get(kind);};
  const at=(buffer,phase)=>{const i=Math.floor(phase)%buffer.length,f=phase-Math.floor(phase);return buffer[i]*(1-f)+buffer[(i+1)%buffer.length]*f;};
  const delayLength=Math.round(rate*.14),delay=[new Float32Array(delayLength),new Float32Array(delayLength)];
  let frame=null,voice=null,delayIndex=0;
  const smoothing=1-Math.exp(-1/(rate*.06));
  for(let i=0;i<length;i++){
    const t=i/rate;
    if(i%1200===0){
      frame=previewFrame(t);
      if(!frame){voice=null;delay.forEach(d=>d.fill(0));}
      else{
        if(voice?.id!==frame.id)voice={id:frame.id,profile:vehicleAudioProfile(frame.vehicle),engine:0,texture:0,air:0,turbine:0,
          spool:0,burst:0,lastLoad:frame.load,lastGear:frame.gear,low:0,bandLow:0,surface:0,airLow:0,distanceLow:0,level:0,rate:0};
        const target=voice.profile.turbo?Math.min(1,Math.max(0,(frame.rpm-1400)/4500))*frame.load:0;
        voice.spool+=(target-voice.spool)*(1-Math.exp(-.05/(target>voice.spool ? .32 : .14)));
        const released=(voice.lastLoad>.55&&frame.load<.2)||voice.lastGear!==frame.gear;
        voice.burst=released&&voice.spool>.25?Math.max(voice.burst,voice.spool*.8):voice.burst*Math.exp(-.05/.17);
        voice.lastLoad=frame.load;voice.lastGear=frame.gear;
      }
    }
    if(!voice||!frame)continue;
    const v=voice,p=v.profile;
    v.level+=(1-v.level)*smoothing;
    v.rate+=(Math.max(.2,Math.min(8,frame.rpm/p.baseRpm))-v.rate)*smoothing;
    const engine=at(get(p.family),v.engine);v.engine=(v.engine+v.rate)%rate;
    const cutoff=(p.marine?360:p.tracks?650:900)+frame.load*4200;
    v.low+=(engine-v.low)*(1-Math.exp(-2*Math.PI*cutoff/rate));
    v.bandLow+=(engine-v.bandLow)*(1-Math.exp(-2*Math.PI*350/rate));
    let sample=v.low*settings.engines*(.1+frame.load*.06)+(v.low-v.bandLow)*settings.engines*frame.load*.14;
    const texture=at(get(p.tracks?'track':p.marine?'air':'friction'),v.texture);
    v.texture=(v.texture+(p.tracks ? .35+frame.speed/6 : 1))%rate;
    v.surface+=(texture-v.surface)*(1-Math.exp(-2*Math.PI*(p.tracks?750+frame.speed*25:450+frame.slip*2000+frame.speed*12)/rate));
    sample+=v.surface*(p.tracks?frame.speed/32*settings.tracks*.16:(frame.speed/32*.018+frame.slip*.12)*settings.tires);
    const air=at(get('air'),v.air);v.air=(v.air+1)%rate;v.airLow+=(air-v.airLow)*.3;
    sample+=(air-v.airLow)*((frame.boost?settings.nitrous*.085:0)+v.burst*settings.turbo*.13);
    sample+=Math.sin(v.turbine)*v.spool*settings.turbo*.028;
    v.turbine=(v.turbine+2*Math.PI*(800+v.spool*5200)/rate)%(2*Math.PI);
    const [x,y,z]=frame.position,d=Math.hypot(x,y-1.5,z),reference=p.referenceDistance;
    const gain=reference/(reference+1.15*(Math.max(d,reference)-reference));
    v.distanceLow+=(sample-v.distanceLow)*(1-Math.exp(-2*Math.PI*Math.max(850,15000/(1+d*.035))/rate));
    const pan=Math.max(-1,Math.min(1,x/Math.max(1,d))),angle=(pan+1)*Math.PI/4;
    const stereo=[Math.cos(angle),Math.sin(angle)],wet=settings.echo*(.025+frame.echo*.6);
    for(let c=0;c<2;c++){
      const dry=v.distanceLow*gain*stereo[c]*v.level,tail=delay[c][delayIndex];
      delay[c][delayIndex]=dry*wet+tail*.2;
      channels[c][i]=(dry+tail*.5)*settings.master;
    }
    delayIndex=(delayIndex+1)%delayLength;
  }
  return channels;
}

export function measurePcmPreview(channels){
  const stats=(start,end)=>{
    let peak=0,sum=0,left=0,right=0,clipped=0;
    const a=Math.floor(start*SAMPLE_RATE),b=Math.floor(end*SAMPLE_RATE);
    for(let i=a;i<b;i++){const l=channels[0][i],r=channels[1][i];peak=Math.max(peak,Math.abs(l),Math.abs(r));sum+=l*l+r*r;left+=l*l;right+=r*r;if(Math.abs(l)>=1||Math.abs(r)>=1)clipped++;}
    return {peak,rms:Math.sqrt(sum/((b-a)*2)),leftRms:Math.sqrt(left/(b-a)),rightRms:Math.sqrt(right/(b-a)),clippedFrames:clipped};
  };
  return {source:'Original procedural waveforms; portable approximate PCM audition (not the native Web Audio graph)',
    sampleRate:SAMPLE_RATE,channels:2,durationSeconds:PREVIEW_SECONDS,overall:stats(0,PREVIEW_SECONDS),
    sections:PREVIEW_SECTIONS.map(section=>({...section,...stats(section.start,section.end)})),finalVoices:0};
}

export function stereoPcmWave(channels){
  const wave=Buffer.alloc(44+channels[0].length*4);
  wave.write('RIFF',0);wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);
  wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(2,22);
  wave.writeUInt32LE(SAMPLE_RATE,24);wave.writeUInt32LE(SAMPLE_RATE*4,28);
  wave.writeUInt16LE(4,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(wave.length-44,40);
  for(let i=0;i<channels[0].length;i++)for(let c=0;c<2;c++)wave.writeInt16LE(Math.round(Math.max(-1,Math.min(1,channels[c][i]))*32767),44+i*4+c*2);
  return wave;
}
