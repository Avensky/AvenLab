import {useMomentaryFeedback} from "./useMomentaryFeedback";
import {useGameStore} from "../../store/gameStore";
import {enterInspection,leaveInspection} from "../../store/inspectionActions";
import { useState } from "react";
import { useUIStore } from "../../store/uiStore";
import { useInputStore } from "../../store/inputStore";
import { VehicleFlags,PlayerFlags,hasFlag } from "../../store/tools/inputMasks";
import { HoldButton } from "../../controls/TouchControls";
import { useCockpitState } from "./useCockpitState";
import { RadioPanel } from "./RadioPanel";
import { canDrive } from "../../store/tools/inputRouting";
import { useCanDataStore } from "../../store/canDataStore";
import { togglePerformanceDetails } from "../../performance/performanceOverlayStore";

export function ConsoleDisplay() {
  const [minimized,setMinimized]=useState(true);
  const [tab,setTab]=useState<'radio'|'commands'|'apps'>('radio');
  const flags=useInputStore(s=>s.input.vehicleMask),player=useInputStore(s=>s.input.playerMask),store=useInputStore.getState();
  const state=useCockpitState();
  const driving=canDrive();
  const route=(overlay:'settings'|'missions'|'career'|'debug_menu')=>useUIStore.getState().setOverlay(overlay);
  const feedback=useMomentaryFeedback();
  return <section {...feedback} className="console-display" data-expanded={!minimized} aria-label="Vehicle electronic display" onKeyDown={event=>{if(event.key===' '||event.key==='Enter')event.stopPropagation();}}>
    <RadioPanel compact minimized={minimized} onMinimize={()=>setMinimized(!minimized)}/>
    {!minimized&&<><nav className="console-display-tabs" aria-label="Vehicle display tabs">{([['radio','RADIO'],['commands','CONTROLS'],['apps','APPS']] as const).map(([id,label])=><button key={id} type="button" aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}<button type="button" onClick={()=>useUIStore.getState().openSettings("display")}>SETTINGS</button><button type="button" onClick={()=>useUIStore.getState().openSettings("keyboard")}>KEYBINDS</button></nav>
    {tab!=="radio"&&<div className="console-display-content">

      {tab==='commands'&&<div className="console-command-grid">
        {([[VehicleFlags.HEADLIGHTS,'LIGHTS'],[VehicleFlags.BLINKER_LEFT,'LEFT'],[VehicleFlags.BLINKER_RIGHT,'RIGHT'],[VehicleFlags.HAZARDS,'HAZARDS'],[VehicleFlags.ABS,'ABS']] as const).map(([flag,label])=><button type="button" key={flag} aria-pressed={hasFlag(flags,flag)} onClick={()=>store.toggleVehicleFlag(flag)}>{label}</button>)}
        <button type="button" disabled={!state.supported} onClick={()=>store.setAssist(state.confirmed.assist===1?1:state.tcs?2:0,!state.tcs)}>TRAC</button>
        {([[PlayerFlags.CANDUMP,'CAN LOG'],[PlayerFlags.LIVECAN,'LIVE CAN'],[PlayerFlags.DYNO,'DYNO']] as const).map(([flag,label])=><button type="button" key={label} aria-pressed={hasFlag(player,flag)} onClick={()=>store.togglePlayerFlag(flag)}>{label}</button>)}
        <HoldButton disabled={!driving} aria-label="Hold NOS boost" onHold={held=>store.setHeldVehicleFlag('touch-actions',VehicleFlags.BOOST,held)}>NOS</HoldButton>
        <HoldButton disabled={!driving} aria-label="Horn" onHold={held=>store.setHeldPlayerFlag('touch-actions',PlayerFlags.HONK,held)}>HORN</HoldButton>
        <HoldButton disabled={!driving} aria-label="Reset vehicle" onHold={held=>store.setHeldPlayerFlag('touch-actions',PlayerFlags.RESET,held)}>RESET</HoldButton>
        <button type="button" disabled={!state.extended} onClick={()=>store.setCockpit({},10)}>WIPE ONCE</button>
      </div>}
      {tab==='apps'&&<div className="console-command-grid">
        <button type="button" onClick={()=>{leaveInspection();useGameStore.getState().setCamera('DEFAULT');}}>CHASE VIEW</button>
        <button type="button" onClick={()=>{leaveInspection();useGameStore.getState().setCamera('FIRST_PERSON');}}>DRIVER VIEW</button>
        <button type="button" onClick={()=>{leaveInspection();useGameStore.getState().setCamera('BIRDS_EYE');}}>BIRD VIEW</button>
        <button type="button" onClick={()=>enterInspection()}>EDITOR</button>
        <button type="button" onClick={()=>useUIStore.getState().openCockpit()}>COCKPIT</button>
        <button type="button" onClick={()=>route('settings')}>SETTINGS</button>
        <button type="button" onClick={()=>useUIStore.getState().openCockpit('radio')}>RADIO</button>
        <button type="button" onClick={()=>useUIStore.getState().openCockpit('navigation')}>GPS</button>
        <button type="button" onClick={()=>useUIStore.getState().openCockpit('lights')}>LIGHTS</button>
        <button type="button" onClick={()=>useUIStore.getState().openCockpit('wipers')}>WIPERS</button>
        <button type="button" onClick={()=>useUIStore.getState().openCockpit('cruise')}>CRUISE</button>
        <button type="button" onClick={()=>route('missions')}>MISSIONS</button>
        <button type="button" onClick={()=>route('career')}>CAREER</button>
        <button type="button" onClick={()=>route('debug_menu')}>DEBUGGER</button>
        <button type="button" onClick={()=>{const ui=useUIStore.getState();if(ui.overlay==='cockpit')ui.closeOverlay();ui.openVehicleSelection();}}>VEHICLES</button>
        <button type="button" onClick={()=>{useUIStore.getState().closeOverlay();togglePerformanceDetails();}}>RECORDER</button>
        <button type="button" onClick={()=>{useUIStore.getState().closeOverlay();useInputStore.getState().releaseControls();useCanDataStore.getState().setCommandOpen(true);}}>TERMINAL</button>
        <button type="button" onClick={()=>useUIStore.getState().openPause()}>MENU</button>
      </div>}
    </div>}</>}
  </section>;
}
