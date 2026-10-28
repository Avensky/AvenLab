import { useRef } from "react";
import { loadRadioFile,setRadioVolume,toggleRadio,toggleRadioMute,useRadioStore } from "../../store/radioStore";

export function RadioPanel({compact=false}:{compact?:boolean}) {
  const radio=useRadioStore(),file=useRef<HTMLInputElement>(null);
  return <div className="cockpit-radio" data-compact={compact}>
    <div className="radio-display"><small>LOCAL AUDIO / AUX</small><strong>{radio.track}</strong><span role="status">{radio.message||(radio.playing?'PLAYING':'STOPPED')}</span></div>
    <div className="radio-buttons"><button type="button" aria-label="Radio play or pause" onClick={()=>void toggleRadio()} aria-pressed={radio.playing}>{radio.playing?'PAUSE':'PLAY'}</button><button type="button" aria-label="Radio source" onClick={()=>file.current?.click()}>SOURCE</button><button type="button" aria-label="Radio mute" onClick={toggleRadioMute} aria-pressed={radio.muted}>{radio.muted?'UNMUTE':'MUTE'}</button></div>
    <div className="radio-volume"><button type="button" aria-label="Radio volume down" onClick={()=>setRadioVolume(radio.volume-.05)}>−</button><output>VOL {Math.round(radio.volume*100)}</output><button type="button" aria-label="Radio volume up" onClick={()=>setRadioVolume(radio.volume+.05)}>+</button></div>
    <input ref={file} type="file" accept="audio/*" hidden aria-label="Choose local audio" onChange={event=>{const chosen=event.target.files?.[0];if(chosen)void loadRadioFile(chosen);event.target.value='';}}/>
  </div>;
}
