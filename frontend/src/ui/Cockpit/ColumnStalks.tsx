import {memo,useCallback,useEffect,useRef,useState,type CSSProperties,type PointerEvent} from "react";
import {useInputStore} from "../../store/inputStore";
import {VehicleFlags,hasFlag,setFlag} from "../../store/tools/inputMasks";
import {useControlRelease} from "../../controls/useControlRelease";
import {useCockpitState} from "./useCockpitState";
function Stalk({angle,reach=31,spacing=12.5,label,mode,asset,words,onUp,onDown,onTurn,onCancel,disabled,repeat=false,detent=0,latched=false}:{angle:number;reach?:number;spacing?:number;label:string;mode:string;asset:string;words:[string,string];onUp:()=>void;onDown:()=>void;onTurn:()=>void;onCancel?:()=>void;disabled:boolean;repeat?:boolean;detent?:number;latched?:boolean}){
 const pointer=useRef<{id:number;angle:number;y:number;action:-1|0|1}|null>(null),timer=useRef<number|null>(null),suppress=useRef(false),[pull,setPull]=useState(0),callbacks=useRef({onUp,onDown});
 useEffect(()=>{callbacks.current={onUp,onDown};},[onUp,onDown]);
 const release=useCallback(()=>{pointer.current=null;setPull(0);if(timer.current!==null)window.clearTimeout(timer.current);timer.current=null;},[]);useControlRelease(release);
 const fire=(direction:-1|1)=>{(direction===1?callbacks.current.onUp:callbacks.current.onDown)();if(repeat&&pointer.current)timer.current=window.setTimeout(()=>{if(pointer.current?.action===direction)fire(direction);},350);};
 const tap=(direction:-1|1)=>{release();fire(direction);if(!latched){setPull(direction);timer.current=window.setTimeout(release,150);}};
 const polar=(e:PointerEvent<HTMLButtonElement>)=>{const r=e.currentTarget.closest('.wheel-assembly')?.getBoundingClientRect();return r&&r.width?Math.atan2(e.clientY-r.y-r.height/2,e.clientX-r.x-r.width/2)*180/Math.PI:NaN;};
 const finish=(e:PointerEvent<HTMLButtonElement>,cancel=false)=>{const d=pointer.current;if(!d||d.id!==e.pointerId)return;suppress.current=!cancel&&d.action!==0;release();};
 const point=(a:number)=>({left:`${50+reach*Math.cos(a*Math.PI/180)}%`,top:`${50-reach*Math.sin(a*Math.PI/180)}%`});
 return <div className="stalk-actuator" data-latched={latched} data-detent={latched?detent:pull} style={{transform:`rotate(${(latched?detent:pull)*12}deg)`}}>
  <span className="column-stalk-rod" style={{'--stalk-angle':`${-angle}deg`,width:`${reach}%`} as CSSProperties} aria-hidden="true"><i/></span>
  <button type="button" className="column-stalk-cap" disabled={disabled} aria-label={label} title={`${label}: clockwise up, counterclockwise down; center changes mode`} style={{...point(angle),'--stalk-tangent':`${90-angle}deg`} as CSSProperties}
   onContextMenu={e=>e.preventDefault()} onPointerDown={e=>{if(e.button!==0||pointer.current)return;suppress.current=false;pointer.current={id:e.pointerId,angle:polar(e),y:e.clientY,action:0};e.currentTarget.setPointerCapture?.(e.pointerId);}}
   onPointerMove={e=>{const d=pointer.current;if(!d||d.id!==e.pointerId)return;const a=polar(e),delta=Number.isFinite(a)&&Number.isFinite(d.angle)?((a-d.angle+540)%360)-180:d.y-e.clientY,dir=Math.abs(delta)<9?0:delta>0?1:-1;if(dir===d.action)return;if(timer.current!==null)window.clearTimeout(timer.current);d.action=dir;if(!latched)setPull(dir);if(dir)fire(dir);}}
   onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)}
   onClick={()=>{if(suppress.current){suppress.current=false;return;}onTurn();}}
   onKeyDown={e=>{if(['ArrowUp','ArrowDown','Escape'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='Escape')onCancel?.();else tap(e.key==='ArrowUp'?1:-1);}}}>
   <img src={`/images/${asset}`} alt=""/><span>{mode}</span>
  </button>
  {([1,-1] as const).map((dir,i)=>{const a=angle-dir*spacing;return <button key={dir} type="button" className="stalk-step" disabled={disabled} aria-label={`${label} ${dir===1?'up':'down'}`} style={{...point(a),transform:`translate(-50%,-50%) rotate(${90-a}deg)`}} onClick={()=>tap(dir)}>{words[i]}</button>;})}
 </div>;
}
export const ColumnStalks=memo(function ColumnStalks(){
 const state=useCockpitState(),flags=useInputStore(s=>s.input.vehicleMask),washerTimer=useRef<number|null>(null);
 const clearWasher=useCallback(()=>{if(washerTimer.current!==null)window.clearTimeout(washerTimer.current);washerTimer.current=null;const s=useInputStore.getState();if((s.input.cockpit_mask??0)&4096)s.setCockpit({washer:false},5);},[]);useControlRelease(clearWasher);
 const detent=hasFlag(flags,VehicleFlags.BLINKER_RIGHT)?1:hasFlag(flags,VehicleFlags.BLINKER_LEFT)?-1:0;
 const turn=(direction:1|-1)=>{const store=useInputStore.getState(),f=store.input.vehicleMask,current=hasFlag(f,VehicleFlags.BLINKER_RIGHT)?1:hasFlag(f,VehicleFlags.BLINKER_LEFT)?-1:0,next=Math.max(-1,Math.min(1,current+direction));store.setInput({vehicleMask:setFlag(setFlag(f,VehicleFlags.BLINKER_LEFT,next===-1),VehicleFlags.BLINKER_RIGHT,next===1)});};
 const wash=()=>{clearWasher();useInputStore.getState().setCockpit({washer:true},5);washerTimer.current=window.setTimeout(clearWasher,400);},change=useInputStore.getState().setCockpit;
 return <div className="column-stalks" role="group" aria-label="Steering column controls">
  <Stalk angle={120} label="Lights and turn signal stalk" words={['R','L']} asset="headlights.svg" mode={['OFF','AUTO','ON','HIGH'][state.confirmed.lights]} disabled={!state.supported} latched detent={detent} onUp={()=>turn(1)} onDown={()=>turn(-1)} onTurn={()=>change({lights:(state.current.lights+1)%3},6)} onCancel={()=>useInputStore.getState().setInput({vehicleMask:flags&~(VehicleFlags.BLINKER_LEFT|VehicleFlags.BLINKER_RIGHT)})}/>
  <Stalk angle={60} label="Wiper and washer stalk" words={['WASH','WIPE']} asset="windshield-wiper.svg" mode={['OFF','SLOW','MID','HIGH'][state.confirmed.wipers]} disabled={!state.extended} onUp={wash} onDown={()=>change({},10)} onTurn={()=>change({wipers:(state.current.wipers+1)%4},7)}/>
  <Stalk angle={292.5} reach={29} spacing={11} label="Cruise control stalk" words={['RES+','SET−']} asset="cruise-control.svg" mode={state.confirmed.cruiseEnabled?'ON':'OFF'} disabled={!state.extended} repeat onUp={()=>change({},8)} onDown={()=>change({},9)} onTurn={()=>change({cruiseEnabled:!state.current.cruiseEnabled,cruiseAction:0},4)} onCancel={()=>change({cruiseAction:3},4)}/>
 </div>;
});
