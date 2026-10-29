import {useMomentaryFeedback} from "./useMomentaryFeedback";
import {memo,useEffect,useRef} from "react";
import {loadRadioFiles,setRadioVolume,toggleRadio,toggleRadioMute,useRadioStore,nextRadioTrack,previousRadioTrack,restartRadio} from "../../store/radioStore";
import {RotaryKnob} from "./RotaryKnob";
import {startVehicleTelemetry,useVehicleTelemetryStore} from "../../store/vehicleTelemetryStore";
import {ResourceFlags} from "../../store/tools/resourceMasks";

// Only a changed notice redraws this line; vehicle ticks do not redraw the radio.
const RadioStatus=memo(function RadioStatus({fallback}:{fallback:string}){
 useEffect(startVehicleTelemetry,[]);
 const notice=useVehicleTelemetryStore(({data:{signal,resourceMask:mask}})=>signal==='offline'?'LINK LOST':signal==='stale'?'NO SIGNAL':signal!=='live'?'WAITING':mask&ResourceFlags.STARVED?'FUEL EMPTY':mask&ResourceFlags.HEAT_LOCK?'COOL ENGINE':mask&ResourceFlags.HOT?'ENGINE HOT':mask&ResourceFlags.LOW_FUEL?'LOW FUEL':mask&ResourceFlags.DAMAGED?'REPAIR':mask&ResourceFlags.STARTING?'STARTING':'');
 return <small className="radio-vehicle-status" data-alert={Boolean(notice)} role={notice?'status':undefined} title={notice||fallback}>{notice||fallback}</small>;
});
export function RadioPanel({compact=false,minimized=false,onMinimize}:{compact?:boolean;minimized?:boolean;onMinimize?:()=>void}){
 const radio=useRadioStore(),file=useRef<HTMLInputElement>(null);
 const feedback=useMomentaryFeedback();
 return <div {...feedback} className="cockpit-radio" data-compact={compact}>
  <div className="radio-display"><strong>{radio.title||radio.track}</strong><RadioStatus fallback={radio.artist||radio.station}/>{onMinimize&&<button type="button" className="component-minimize" aria-label={minimized?'Expand radio':'Minimize radio'} aria-expanded={!minimized} onClick={onMinimize}>{minimized?'⌃':'⌄'}</button>}</div>
  <div className="radio-transport">
   <button type="button" aria-label="Radio previous track" title="Previous / replay" disabled={!radio.trackCount} onClick={()=>void previousRadioTrack()}>⏮</button>
   <button type="button" aria-label="Radio play or pause" onClick={()=>void toggleRadio()} aria-pressed={radio.playing}>{radio.playing?'Ⅱ':'▶'}</button>
   <button type="button" aria-label="Radio next track" title="Next track" disabled={radio.trackCount<2} onClick={()=>void nextRadioTrack()}>⏭</button>
   <button type="button" aria-label="Radio restart track" title="Start from beginning" disabled={!radio.trackCount} onClick={restartRadio}>↺</button>
   <button type="button" aria-label="Radio source" title="Select audio files" onClick={()=>file.current?.click()}>＋</button>
   <div className="radio-volume-dial"><RotaryKnob label="Radio volume" min={0} max={20} value={Math.round(radio.volume*20)} readout={String(Math.round(radio.volume*100))} onChange={v=>setRadioVolume(v/20)} action="Radio mute" actionText={radio.muted?"×":"♪"} active={radio.muted} onAction={toggleRadioMute}/></div>
  </div>
  {radio.message&&<span className="radio-status" role="status">{radio.message}</span>}
  <input ref={file} type="file" accept="audio/*" multiple hidden aria-label="Choose local audio" onChange={e=>{const files=Array.from(e.target.files??[]);if(files.length)void loadRadioFiles(files);e.target.value='';}}/>
 </div>;
}
