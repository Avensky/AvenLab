import { useEffect, useRef, useState } from "react";
import { useUIStore, type CockpitTab } from "../../store/uiStore";
import { useInputStore } from "../../store/inputStore";
import { startVehicleTelemetry, useVehicleTelemetryStore } from "../../store/vehicleTelemetryStore";
import { cockpitStatus, unpackCockpit } from "../../store/tools/cockpitMasks";
import { VehicleFlags, hasFlag } from "../../store/tools/inputMasks";
import { trapMenuFocus } from "../../components/menus/menuFocus";
import type { MenuAction } from "../../store/tools/inputRouting";
import { GearSelector, HandbrakeLever } from "./MechanicalControls";
import { DriveAssists } from "./DriveAssists";
import { loadRadioFile, setRadioVolume, toggleRadio, toggleRadioMute, useRadioStore } from "../../store/radioStore";
import "./cockpit.css";

export function CabinClock() {
  const [time,setTime]=useState(()=>new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hour12:false}));
  useEffect(()=>{const timer=window.setInterval(()=>setTime(new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hour12:false})),30_000);return()=>window.clearInterval(timer);},[]);
  return <time className="cabin-clock">{time}</time>;
}
const tabs: {id:CockpitTab;label:string}[]=[{id:'drive',label:'DRIVE'},{id:'lights',label:'LIGHTS'},{id:'wipers',label:'WIPERS'},{id:'cruise',label:'CRUISE'},{id:'radio',label:'RADIO'},{id:'vehicle',label:'VEHICLE'}];

function RadioPanel() {
  const radio=useRadioStore(),file=useRef<HTMLInputElement>(null);
  return <div className="cockpit-radio">
    <div className="radio-display"><small>LOCAL AUDIO / AUX</small><strong>{radio.track}</strong><span>{radio.message|| (radio.playing?'PLAYING':'STOPPED')}</span></div>
    <div className="radio-buttons"><button onClick={()=>void toggleRadio()} aria-pressed={radio.playing}>{radio.playing?'PAUSE':'PLAY'}</button><button onClick={()=>file.current?.click()}>SOURCE</button><button onClick={toggleRadioMute} aria-pressed={radio.muted}>{radio.muted?'UNMUTE':'MUTE'}</button></div>
    <div className="radio-volume"><button aria-label="Radio volume down" onClick={()=>setRadioVolume(radio.volume-.05)}>−</button><output>VOL {Math.round(radio.volume*100)}</output><button aria-label="Radio volume up" onClick={()=>setRadioVolume(radio.volume+.05)}>+</button></div>
    <input ref={file} type="file" accept="audio/*" hidden aria-label="Choose local audio" onChange={event=>{const chosen=event.target.files?.[0];if(chosen)void loadRadioFile(chosen);event.target.value='';}} />
  </div>;
}

export function CockpitPanel() {
  useEffect(startVehicleTelemetry, []);
  const tab=useUIStore(s=>s.cockpitTab),requestedMask=useInputStore(s=>s.input.cockpit_mask);
  const vehicle=useInputStore(s=>s.input.vehicleMask),confirmedMask=useVehicleTelemetryStore(s=>s.data.cockpitMask);
  const supported=useVehicleTelemetryStore(s=>s.data.signal==='live'&&s.data.config.cockpitVersion>=2);
  const actualGear=useVehicleTelemetryStore(s=>s.data.gear),speed=useVehicleTelemetryStore(s=>Math.round(s.data.speedKph??0));
  const requested=unpackCockpit(requestedMask??confirmedMask??undefined),confirmed=unpackCockpit(confirmedMask??undefined),status=cockpitStatus(confirmedMask);
  const pending=requestedMask!==undefined&&(confirmedMask===null||requested.revision!==confirmed.revision);
  const current=pending?requested:confirmed;
  const root=useRef<HTMLElement>(null),washerTimer=useRef<number|null>(null);
  const change=useInputStore.getState().setCockpit;
  const close=()=>useUIStore.getState().closeOverlay();
  const wash=()=>{if(washerTimer.current!==null)window.clearTimeout(washerTimer.current);change({washer:true},5);washerTimer.current=window.setTimeout(()=>{change({washer:false},5);washerTimer.current=null;},400);};
  useEffect(()=>()=>{if(washerTimer.current!==null){window.clearTimeout(washerTimer.current);useInputStore.getState().setCockpit({washer:false},5);}},[]);
  useEffect(()=>{root.current?.querySelector<HTMLButtonElement>(`[data-cockpit-tab="${tab}"]`)?.focus({preventScroll:true});},[tab]);
  useEffect(()=>{
    const navigate=(action:MenuAction)=>{
      if(action==='back'){useUIStore.getState().closeOverlay();return;}
      if(action==='next_tab'||action==='previous_tab'){
        const state=useUIStore.getState(),index=tabs.findIndex(item=>item.id===state.cockpitTab);state.setCockpitTab(tabs[(index+(action==='next_tab'?1:-1)+tabs.length)%tabs.length].id);return;
      }
      const buttons=Array.from(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]).filter(button=>button.tabIndex>=0&&button.getClientRects().length>0);
      const active=document.activeElement as HTMLButtonElement;
      if(action==='activate'){if(buttons.includes(active))active.click();return;}
      const index=buttons.indexOf(active),origin=active?.getBoundingClientRect();
      if(!origin){buttons[0]?.focus();return;}
      const horizontal=action==='left'||action==='right',direction=action==='left'||action==='up'?-1:1;
      const ox=origin.x+origin.width/2,oy=origin.y+origin.height/2;
      const candidates=buttons.filter(button=>button!==active).map(button=>{const r=button.getBoundingClientRect(),dx=r.x+r.width/2-ox,dy=r.y+r.height/2-oy;
        return {button,primary:(horizontal?dx:dy)*direction,secondary:Math.abs(horizontal?dy:dx)};}).filter(item=>item.primary>2).sort((a,b)=>(a.primary+a.secondary*3)-(b.primary+b.secondary*3));
      const next=candidates[0]?.button??buttons[(index+direction+buttons.length)%buttons.length];next?.focus();next?.scrollIntoView({block:'nearest',inline:'nearest'});
    };
    const event=(e:Event)=>navigate((e as CustomEvent<MenuAction>).detail);
    window.addEventListener('avenlab:panel-action',event);
    const keyboard=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();navigate('back');return;}
      const action=({ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'} as const)[e.key as 'ArrowLeft'];
      if(action){e.preventDefault();e.stopPropagation();navigate(action);}};
    const element=root.current;element?.addEventListener('keydown',keyboard);
    return()=>{window.removeEventListener('avenlab:panel-action',event);element?.removeEventListener('keydown',keyboard);};
  },[]);
  const route=(overlay:'settings'|'missions'|'debug_menu'|'vehicle_select')=>{useUIStore.getState().closeOverlay();useUIStore.getState().setOverlay(overlay);};
  const rejection=status.rejection===2?'STOP BEFORE SELECTING PARK OR REVERSE':status.rejection===3?'CRUISE SET REQUIRES 30 KM/H':status.rejection?'REQUEST UNAVAILABLE':'';
  return <div className="cockpit-overlay"><section className="cockpit-panel" ref={root} role="dialog" aria-modal="true" aria-labelledby="cockpit-title" onKeyDown={event=>{trapMenuFocus(event);if(event.key==='Enter'||event.key===' ')event.stopPropagation();}}>
    <header className="cockpit-header"><h1 id="cockpit-title">COCKPIT</h1><CabinClock/><button className="physical-hazard" aria-label="Hazards" aria-pressed={hasFlag(vehicle,VehicleFlags.HAZARDS)} onClick={()=>useInputStore.getState().toggleVehicleFlag(VehicleFlags.HAZARDS)}>△</button><button className="cockpit-back" onClick={close}><kbd>B</kbd> CLOSE</button></header>
    <nav className="cockpit-tabs" aria-label="Cockpit systems">{tabs.map(item=><button key={item.id} data-cockpit-tab={item.id} aria-pressed={tab===item.id} onClick={()=>useUIStore.getState().setCockpitTab(item.id)}>{item.label}</button>)}</nav>
    <div className="cockpit-content">
      {tab==='drive'&&<div className="cockpit-drive-layout"><GearSelector automatic={current.automatic} gear={current.gear} actualGear={actualGear} disabled={!supported} pending={pending}/><HandbrakeLever strength={current.parkingStrength} disabled={!supported} pending={pending}/>
        <DriveAssists /></div>}
      {tab==='lights'&&<div className="cockpit-system"><div className="control-stalk stalk-left"><span>◀ TURN ▶</span><i/><b>OFF · AUTO · LOW · HIGH</b></div>
        <div className="cockpit-segments">{['OFF','AUTO','LOW','HIGH'].map((label,index)=><button key={label} disabled={!supported} aria-label={`Lights ${label.toLowerCase()}`} aria-pressed={current.lights===index} onClick={()=>change({lights:index},6)}>{label}</button>)}</div>
        <div className="wheel-signals"><button aria-label="Left indicator" aria-pressed={hasFlag(vehicle,VehicleFlags.BLINKER_LEFT)} onClick={()=>useInputStore.getState().toggleVehicleFlag(VehicleFlags.BLINKER_LEFT)}>◀</button><div className="digital-wheel"><i/><b/></div><button aria-label="Right indicator" aria-pressed={hasFlag(vehicle,VehicleFlags.BLINKER_RIGHT)} onClick={()=>useInputStore.getState().toggleVehicleFlag(VehicleFlags.BLINKER_RIGHT)}>▶</button></div></div>}
      {tab==='wipers'&&<div className="cockpit-system"><div className="control-stalk stalk-right"><span>WASH ↗</span><i/><b>OFF · LOW · MID · HIGH</b></div>
        <div className="wiper-window" data-speed={confirmed.wipers}><span/><span/></div><div className="cockpit-segments">{['OFF','LOW','MID','HIGH'].map((label,index)=><button key={label} disabled={!supported} aria-label={`Wipers ${label.toLowerCase()}`} aria-pressed={current.wipers===index} onClick={()=>change({wipers:index},7)}>{label}</button>)}</div><button className="wash-button" disabled={!supported} onClick={wash}>WINDSHIELD WASH</button></div>}
      {tab==='cruise'&&<div className="cockpit-system"><div className="control-stalk cruise-stalk"><span>CANCEL ↗</span><i/><b>+ RES ▲<br/>− SET ▼</b></div><div className="cruise-readout" data-active={status.cruiseActive}>{status.cruiseActive?'CRUISE SET':confirmed.cruiseEnabled?'CRUISE READY':'CRUISE OFF'}</div>
        <div className="cockpit-segments"><button disabled={!supported} aria-pressed={current.cruiseEnabled} onClick={()=>change({cruiseEnabled:!current.cruiseEnabled,cruiseAction:0},4)}>ON / OFF</button><button disabled={!supported||!current.cruiseEnabled} onClick={()=>change({cruiseAction:1},4)}>− SET</button><button disabled={!supported||!current.cruiseEnabled} onClick={()=>change({cruiseAction:2},4)}>+ RES</button><button disabled={!supported} onClick={()=>change({cruiseAction:3},4)}>CANCEL</button></div><small>{speed} KM/H · BRAKE CANCELS CRUISE</small></div>}
      {tab==='radio'&&<RadioPanel/>}
      {tab==='vehicle'&&<div className="headunit-apps"><button onClick={()=>route('vehicle_select')}><img src="/images/car-sport.svg" alt=""/>VEHICLES</button><button onClick={()=>route('missions')}><img src="/images/mark2.svg" alt=""/>MISSIONS</button><button onClick={()=>route('settings')}><img src="/images/settings.svg" alt=""/>SETTINGS</button><button onClick={()=>useUIStore.getState().setCockpitTab('radio')}><img src="/images/soundOn.svg" alt=""/>RADIO</button><button onClick={()=>route('debug_menu')}><img src="/images/tools.svg" alt=""/>DEBUGGER</button><button onClick={close}><img src="/images/forward.svg" alt=""/>RESUME</button></div>}
    </div>
    <footer className="cockpit-status" role="status">{!supported&&tab!=='radio'&&tab!=='vehicle'?'UPDATED RUST SERVER REQUIRED':pending?'REQUESTING…':rejection||'REDLINE VECTOR'}</footer>
  </section></div>;
}
