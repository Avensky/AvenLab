import { useCallback, useRef, type PointerEvent } from "react";
import { useInputStore } from "../../store/inputStore";
import { useCockpitState } from "./useCockpitState";
import { useControlRelease } from "../../controls/useControlRelease";

const positions = ["OFF", "ACC", "ON", "START"];
const angles = [-55, -15, 30, 72];
export function IgnitionSwitch() {
  const { extended,confirmedCabin:state,cabinMask }=useCockpitState();
  const pulse=useRef<number|null>(null),drag=useRef<{id:number;angle:number;position:number;moved:boolean}|null>(null),suppress=useRef(false);
  const send=(position:number,inserted=state.keyInserted)=>useInputStore.getState().setIgnition(position,inserted,cabinMask??undefined);
  const release=useCallback(()=>{
    if(pulse.current!==null){window.clearTimeout(pulse.current);pulse.current=null;}
    const mask=useInputStore.getState().input.cabin_mask;
    if(mask!==undefined&&((mask>>>10)&3)===3)useInputStore.getState().setIgnition(2,true);
    drag.current=null;
  },[]);
  useControlRelease(release);
  const crank=()=>{if(pulse.current!==null)window.clearTimeout(pulse.current);send(3,true);pulse.current=window.setTimeout(release,1000);};
  const choose=(position:number)=>{if(!state.keyInserted)return;if(position===3)crank();else {release();send(position);}};
  const finish=(event:PointerEvent<HTMLButtonElement>,cancel=false)=>{
    const start=drag.current;if(!start||start.id!==event.pointerId)return;
    const moved=start.moved;drag.current=null;
    if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(moved){suppress.current=!cancel;release();}
  };
  return <div className="ignition-system" data-ignition={positions[state.ignition]} data-key-inserted={state.keyInserted}>
    <button type="button" className="ignition-cylinder" disabled={!extended||!state.keyInserted} aria-label="Ignition key"
      aria-description="Turn clockwise through Off, Accessory, On and Start. Start cranks the engine; release returns to On."
      onClick={()=>{if(suppress.current){suppress.current=false;return;}choose((state.ignition+1)%4);}}
      onPointerDown={event=>{if(event.button!==0||drag.current)return;const r=event.currentTarget.getBoundingClientRect();suppress.current=false;
        drag.current={id:event.pointerId,angle:Math.atan2(event.clientY-r.y-r.height/2,event.clientX-r.x-r.width/2)*180/Math.PI,position:state.ignition,moved:false};event.currentTarget.setPointerCapture?.(event.pointerId);}}
      onPointerMove={event=>{const start=drag.current;if(!start||start.id!==event.pointerId)return;const r=event.currentTarget.getBoundingClientRect();
        const angle=Math.atan2(event.clientY-r.y-r.height/2,event.clientX-r.x-r.width/2)*180/Math.PI,delta=((angle-start.angle+540)%360)-180;
        if(Math.abs(delta)>12){start.moved=true;const next=Math.max(0,Math.min(3,start.position+Math.round(delta/36)));send(next);}}}
      onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)}
      onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();event.stopPropagation();choose(Math.max(0,Math.min(3,state.ignition+(event.key==='ArrowRight'?1:-1))));}}}>
      <span className="ignition-trim"/><span className="ignition-key" style={{transform:`rotate(${angles[state.ignition]}deg)`}}><i/><b/></span>
    </button>
    <div className="ignition-options" role="group" aria-label="Ignition positions">{positions.map((label,index)=><button type="button" key={label} disabled={!extended||!state.keyInserted} aria-label={`Ignition ${label.toLowerCase()}`} aria-pressed={state.ignition===index} onClick={()=>choose(index)}>{label}</button>)}
      <button type="button" className="key-insert" disabled={!extended||state.ignition!==0} aria-label="Insert or remove ignition key" aria-pressed={state.keyInserted} onClick={()=>send(0,!state.keyInserted)}>{state.keyInserted?'REMOVE KEY':'INSERT KEY'}</button>
    </div>
  </div>;
}
