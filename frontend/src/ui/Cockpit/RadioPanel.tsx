import { useRef } from "react";
import { loadRadioFile,setRadioVolume,toggleRadio,toggleRadioMute,useRadioStore } from "../../store/radioStore";

export function RadioPanel({compact=false,minimized=false,onMinimize}:{compact?:boolean;minimized?:boolean;onMinimize?:()=>void}) {
  const radio=useRadioStore(),file=useRef<HTMLInputElement>(null);
  return <div className="cockpit-radio" data-compact={compact}>
    <div className="radio-display"><strong>{radio.title||radio.track}</strong><small>{radio.artist||radio.station}</small>{onMinimize&&<button type="button" className="component-minimize" aria-label={minimized?"Expand radio":"Minimize radio"} aria-expanded={!minimized} onClick={onMinimize}>{minimized?"⌃":"⌄"}</button>}</div>
    <div className="radio-buttons"><button type="button" aria-label="Radio play or pause" onClick={()=>void toggleRadio()} aria-pressed={radio.playing}>{radio.playing?'PAUSE':'PLAY'}</button><button type="button" aria-label="Radio source" onClick={()=>file.current?.click()}>SOURCE</button><button type="button" aria-label="Radio mute" onClick={toggleRadioMute} aria-pressed={radio.muted}>{radio.muted?'UNMUTE':'MUTE'}</button></div>
    {!minimized&&<div className="radio-volume"><button type="button" aria-label="Radio volume down" onClick={()=>setRadioVolume(radio.volume-.05)}>−</button><output>VOL {Math.round(radio.volume*100)}</output><button type="button" aria-label="Radio volume up" onClick={()=>setRadioVolume(radio.volume+.05)}>+</button></div>}
    {radio.message&&<span className="radio-status" role="status">{radio.message}</span>}
    <input ref={file} type="file" accept="audio/*" hidden aria-label="Choose local audio" onChange={event=>{const chosen=event.target.files?.[0];if(chosen)void loadRadioFile(chosen);event.target.value='';}}/>
  </div>;
}
