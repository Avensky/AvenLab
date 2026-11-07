import {DEFAULT_VEHICLE_AUDIO} from './audioSettings.ts';

export type SharedVehicleAudio = {context:AudioContext;output:GainNode};
let runtime:SharedVehicleAudio|null=null;
let desiredGain:number=DEFAULT_VEHICLE_AUDIO.master;
let limiter:DynamicsCompressorNode|null=null;
let visibilityCleanup:(()=>void)|null=null;

/** Replace, rather than append, param automation. The event list stays bounded
 * during a long drive; the current value is retained for a short smooth ramp. */
export function smoothAudioParam(parameter:AudioParam,value:number,now:number,seconds=.06){
  if(!Number.isFinite(value)||!Number.isFinite(now))return;
  const current=Number.isFinite(parameter.value)?parameter.value:value;
  parameter.cancelScheduledValues(0);
  parameter.setValueAtTime(current,now);
  parameter.setTargetAtTime(value,now,seconds);
}

export function peekVehicleAudio():SharedVehicleAudio|null {
  return runtime?.context.state==='closed'?null:runtime;
}

/** Only call from a real input gesture. Ignition, engine, tires and turbo share
 * this context. Radio remains its separate user-supplied media player. */
export function unlockVehicleAudio():SharedVehicleAudio|null {
  if(typeof window==='undefined'||typeof window.AudioContext!=='function')return null;
  try{
    if(!runtime||runtime.context.state==='closed'){
      const context=new window.AudioContext({latencyHint:'interactive'});
      const output=context.createGain();output.gain.value=desiredGain;
      limiter=context.createDynamicsCompressor();
      limiter.threshold.value=-8;limiter.knee.value=12;limiter.ratio.value=8;
      limiter.attack.value=.003;limiter.release.value=.15;
      output.connect(limiter).connect(context.destination);
      runtime={context,output};
      if(typeof document!=='undefined'){
        const visibility=()=>{
          if(!runtime)return;
          if(document.hidden){
            // Silence before suspend so a resumed tab cannot replay old tones.
            runtime.output.gain.cancelScheduledValues(0);
            runtime.output.gain.setValueAtTime(0,runtime.context.currentTime);
            if(runtime.context.state==='running')void runtime.context.suspend().catch(()=>{});
          }else if(runtime.context.state==='suspended'){
            void runtime.context.resume().then(()=>{
              if(runtime) smoothAudioParam(runtime.output.gain,desiredGain,runtime.context.currentTime,.08);
            }).catch(()=>{});
          }
        };
        document.addEventListener('visibilitychange',visibility);
        visibilityCleanup=()=>document.removeEventListener('visibilitychange',visibility);
      }
    }
    if(runtime.context.state==='suspended'&&(typeof document==='undefined'||!document.hidden))
      void runtime.context.resume().catch(()=>{});
    return runtime;
  }catch{
    // Missing audio devices/autoplay restrictions never prevent vehicle control.
    return null;
  }
}

export function setVehicleAudioMaster(enabled:boolean,volume:number){
  const next=enabled&&Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):0;
  if(next===desiredGain)return;
  desiredGain=next;
  const active=peekVehicleAudio();
  if(active&&(typeof document==='undefined'||!document.hidden))
    smoothAudioParam(active.output.gain,next,active.context.currentTime,.035);
}

/** Only the context owner closes it; individual effects disconnect their nodes. */
export function disposeSharedVehicleAudio(){
  visibilityCleanup?.();visibilityCleanup=null;
  const old=runtime;runtime=null;
  old?.output.disconnect();limiter?.disconnect();limiter=null;
  if(old)void old.context.close().catch(()=>{});
}
if(import.meta.hot)import.meta.hot.dispose(disposeSharedVehicleAudio);
