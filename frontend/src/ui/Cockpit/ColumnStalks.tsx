import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useInputStore } from "../../store/inputStore";
import { VehicleFlags,hasFlag,setFlag } from "../../store/tools/inputMasks";
import { useControlRelease } from "../../controls/useControlRelease";
import { useCockpitState } from "./useCockpitState";

function Stalk({angle,label,mode,asset,onUp,onDown,onTurn,onCancel,disabled,repeat=false}:{
 angle:number;label:string;mode:string;asset:string;onUp:()=>void;onDown:()=>void;onTurn:()=>void;onCancel?:()=>void;disabled:boolean;repeat?:boolean;
}) {
 const pointer=useRef<{id:number;angle:number;y:number;action:-1|0|1}|null>(null),timer=useRef<number|null>(null),suppress=useRef(false),[pull,setPull]=useState(0);
 const callbacks=useRef({onUp,onDown});useEffect(()=>{callbacks.current={onUp,onDown};},[onUp,onDown]);
 const release=useCallback(()=>{pointer.current=null;setPull(0);if(timer.current!==null)window.clearTimeout(timer.current);timer.current=null;},[]);useControlRelease(release);
 const fire=(direction:-1|1)=>{(direction===1?callbacks.current.onUp:callbacks.current.onDown)();if(repeat&&pointer.current)timer.current=window.setTimeout(()=>{if(pointer.current?.action===direction)fire(direction);},350);};
 const tap=(direction:-1|1)=>{release();setPull(direction);fire(direction);timer.current=window.setTimeout(release,150);};
 const polar=(e:PointerEvent<HTMLButtonElement>)=>{const rect=e.currentTarget.closest('.wheel-assembly')?.getBoundingClientRect();return rect&&rect.width?Math.atan2(e.clientY-rect.y-rect.height/2,e.clientX-rect.x-rect.width/2)*180/Math.PI:NaN;};
 const finish=(e:PointerEvent<HTMLButtonElement>,cancel=false)=>{const d=pointer.current;if(!d||d.id!==e.pointerId)return;suppress.current=!cancel&&d.action!==0;release();};
 const reach=angle===315?23:31,point=(a:number)=>({left:`${50+reach*Math.cos(a*Math.PI/180)}%`,top:`${50-reach*Math.sin(a*Math.PI/180)}%`});
 const words=angle===120?['R','L']:angle===60?['WASH','WIPE']:['RES+','SET−'];
 return <>
  <div className="stalk-actuator" style={{transform:`rotate(${pull*12}deg)`}}>
   <span className="column-stalk-rod" style={{'--stalk-angle':`${-angle}deg`,width:`${reach}%`} as CSSProperties} aria-hidden="true"><i/></span>
   <button type="button" className="column-stalk-cap" disabled={disabled} aria-label={label} title={`${label}: clockwise up, counterclockwise down; tap center to rotate mode`} style={{...point(angle),'--stalk-tangent':`${90-angle}deg`} as CSSProperties}
    onContextMenu={e=>e.preventDefault()} onPointerDown={e=>{if(e.button!==0||pointer.current)return;suppress.current=false;pointer.current={id:e.pointerId,angle:polar(e),y:e.clientY,action:0};e.currentTarget.setPointerCapture?.(e.pointerId);}}
    onPointerMove={e=>{const d=pointer.current;if(!d||d.id!==e.pointerId)return;const a=polar(e),delta=Number.isFinite(a)&&Number.isFinite(d.angle)?((a-d.angle+540)%360)-180:(d.y-e.clientY);const dir=Math.abs(delta)<9?0:delta>0?1:-1;if(dir===d.action)return;if(timer.current!==null)window.clearTimeout(timer.current);d.action=dir;setPull(dir);if(dir)fire(dir);}}
    onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)}
    onClick={()=>{if(suppress.current){suppress.current=false;return;}onTurn();}}
    onKeyDown={e=>{if(['ArrowUp','ArrowDown','Escape'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='Escape')onCancel?.();else tap(e.key==='ArrowUp'?1:-1);}}}>
    <img src={`/images/${asset}`} alt=""/><span>{mode}</span>
   </button>
  </div>
  {([1,-1] as const).map((dir,i)=>{const a=angle-dir*30;return <button key={dir} type="button" className="stalk-step" disabled={disabled} aria-label={`${label} ${dir===1?'up':'down'}`} style={{...point(a),transform:`translate(-50%,-50%) rotate(${90-a}deg)`}} onClick={()=>tap(dir)}>{words[i]}</button>;})}
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
