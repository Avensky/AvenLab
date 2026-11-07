/** Original procedural friction noise. No external sample or download. */
export function createTireSqueal(){
 let context:AudioContext|null=null,gain:GainNode|null=null,filter:BiquadFilterNode|null=null,source:AudioBufferSourceNode|null=null;
 return {
  unlock(){
   try{
    if(!context){
     context=new AudioContext();gain=context.createGain();gain.gain.value=0;
     filter=context.createBiquadFilter();filter.type='bandpass';filter.frequency.value=1550;filter.Q.value=4;
     const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),data=buffer.getChannelData(0);
     let seed=937;for(let i=0;i<data.length;i++){seed=(1664525*seed+1013904223)>>>0;data[i]=seed/2147483648-1;}
     source=context.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(filter).connect(gain).connect(context.destination);source.start();
    }
    if(context.state==='suspended')void context.resume().catch(()=>{});
   }catch{/* Audio cannot prevent driving. */}
  },
  update(intensity:number,volume:number){
   if(!context||!gain||!filter||context.state!=='running')return;
   const strength=Number.isFinite(intensity)?Math.min(1,Math.max(0,intensity)):0;
   gain.gain.setTargetAtTime(strength*(Number.isFinite(volume)?Math.min(1,Math.max(0,volume)):0)*.16,context.currentTime,.05);
   filter.frequency.setTargetAtTime(1100+strength*1200,context.currentTime,.08);
  },
  dispose(){source?.stop();source?.disconnect();filter?.disconnect();gain?.disconnect();void context?.close().catch(()=>{});context=null;source=null;gain=null;filter=null;},
 };
}
