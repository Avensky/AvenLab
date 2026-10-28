import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useInputStore } from "../../store/inputStore";
import { VehicleFlags,hasFlag,setFlag } from "../../store/tools/inputMasks";
import { useControlRelease } from "../../controls/useControlRelease";
import { useCockpitState } from "./useCockpitState";

function Stalk({angle,label,mode,asset,onUp,onDown,onTurn,onCancel,disabled,repeat=false}:{
  angle:number;label:string;mode:string;asset:string;onUp:()=>void;onDown:()=>void;onTurn:()=>void;onCancel?:()=>void;disabled:boolean;repeat?:boolean;
}) {
  const pointer=useRef<{id:number;y:number;action:-1|0|1}|null>(null),timer=useRef<number|null>(null),suppress=useRef(false);
  const callbacks=useRef({onUp,onDown});useEffect(()=>{callbacks.current={onUp,onDown};},[onUp,onDown]);
  const [pull,setPull]=useState(0);
  const release=useCallback(()=>{pointer.current=null;setPull(0);if(timer.current!==null)window.clearTimeout(timer.current);timer.current=null;},[]);
  useControlRelease(release);
  const fire=(direction:-1|1)=>{(direction===-1?callbacks.current.onUp:callbacks.current.onDown)();
    if(repeat)timer.current=window.setTimeout(()=>{if(pointer.current?.action===direction)fire(direction);},350);};
  const finish=(event:PointerEvent<HTMLButtonElement>,cancel=false)=>{
    const current=pointer.current;if(!current||current.id!==event.pointerId)return;
    suppress.current=!cancel&&current.action!==0;release();
    if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const radians=angle*Math.PI/180,reach=angle===315?23:31;
  return <>
    <span className="column-stalk-rod" style={{'--stalk-angle':`${-angle}deg`,width:`${reach}%`} as CSSProperties} aria-hidden="true"><i/></span>
    <button type="button" className="column-stalk-cap" disabled={disabled} aria-label={label} title={`${label} · drag up/down, tap to rotate`}
      style={{left:`${50+reach*Math.cos(radians)}%`,top:`${50-reach*Math.sin(radians)}%`,'--stalk-pull':`${pull}px`} as CSSProperties}
      onPointerDown={event=>{if(event.button!==0||pointer.current)return;suppress.current=false;pointer.current={id:event.pointerId,y:event.clientY,action:0};event.currentTarget.setPointerCapture?.(event.pointerId);}}
      onPointerMove={event=>{const current=pointer.current;if(!current||current.id!==event.pointerId)return;const delta=event.clientY-current.y;
        const direction=Math.abs(delta)<9?0:delta<0?-1:1;if(direction===current.action)return;
        if(timer.current!==null)window.clearTimeout(timer.current);timer.current=null;current.action=direction;setPull(direction*5);
        if(direction)fire(direction);}}
      onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)}
      onClick={()=>{if(suppress.current){suppress.current=false;return;}onTurn();}}
      onKeyDown={event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'||event.key==='Escape'){
        event.preventDefault();event.stopPropagation();if(event.key==='Escape')onCancel?.();else(event.key==='ArrowUp'?onUp:onDown)();
      }else if(event.key===' '||event.key==='Enter')event.stopPropagation();}}>
      <img src={`/images/${asset}`} alt=""/><span>{mode}</span>
    </button>
  </>;
}

export function ColumnStalks() {
  const state=useCockpitState(),flags=useInputStore(s=>s.input.vehicleMask),washerTimer=useRef<number|null>(null);
  const clearWasher=useCallback(()=>{if(washerTimer.current!==null)window.clearTimeout(washerTimer.current);washerTimer.current=null;
    const input=useInputStore.getState();if((input.input.cockpit_mask??0)&(1<<12))input.setCockpit({washer:false},5);},[]);
  useControlRelease(clearWasher);
  const turn=(right:boolean)=>{const store=useInputStore.getState(),flag=right?VehicleFlags.BLINKER_RIGHT:VehicleFlags.BLINKER_LEFT,other=right?VehicleFlags.BLINKER_LEFT:VehicleFlags.BLINKER_RIGHT;
    store.setInput({vehicleMask:setFlag(setFlag(store.input.vehicleMask,other,false),flag,!hasFlag(store.input.vehicleMask,flag))});};
  const wash=()=>{clearWasher();useInputStore.getState().setCockpit({washer:true},5);washerTimer.current=window.setTimeout(clearWasher,400);};
  const change=useInputStore.getState().setCockpit;
  return <div className="column-stalks" role="group" aria-label="Steering column controls">
    <Stalk angle={120} label="Lights and turn signal stalk" asset="headlights.svg" mode={['OFF','AUTO','ON','HIGH'][state.confirmed.lights]}
      disabled={!state.supported} onUp={()=>turn(true)} onDown={()=>turn(false)} onTurn={()=>change({lights:(state.current.lights+1)%3},6)}
      onCancel={()=>useInputStore.getState().setInput({vehicleMask:flags&~(VehicleFlags.BLINKER_LEFT|VehicleFlags.BLINKER_RIGHT)})}/>
    <Stalk angle={60} label="Wiper and washer stalk" asset="windshield-wiper.svg" mode={['OFF','SLOW','MID','HIGH'][state.confirmed.wipers]}
      disabled={!state.extended} onUp={wash} onDown={()=>change({},10)} onTurn={()=>change({wipers:(state.current.wipers+1)%4},7)}/>
    <Stalk angle={315} label="Cruise control stalk" asset="cruise-control.svg" mode={state.confirmed.cruiseEnabled?'ON':'OFF'} disabled={!state.extended} repeat
      onUp={()=>change({},8)} onDown={()=>change({},9)} onTurn={()=>change({cruiseEnabled:!state.current.cruiseEnabled,cruiseAction:0},4)} onCancel={()=>change({cruiseAction:3},4)}/>
  </div>;
}
