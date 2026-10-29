import {memo,useCallback,useEffect,useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import {useInputStore} from '../../store/inputStore';
import {VehicleFlags,hasFlag,setFlag} from '../../store/tools/inputMasks';
import {useControlRelease} from '../../controls/useControlRelease';
import {useCockpitState} from './useCockpitState';
type Direction=-1|1;
type Gesture={id:number|null;key:string|null;kind:'cap'|'step';angle:number;y:number;action:-1|0|1};
function Stalk({angle,reach=31,stepReach=reach,spacing=12.5,label,mode,asset,words,onUp,onDown,onTurn,onCancel,onRelease,disabled,repeat=false,detent=0,latched=false}:{angle:number;reach?:number;stepReach?:number;spacing?:number;label:string;mode:string;asset:string;words:[string,string];onUp:()=>void;onDown:()=>void;onTurn:()=>void;onCancel?:()=>void;onRelease?:(direction:Direction)=>void;disabled:boolean;repeat?:boolean;detent?:number;latched?:boolean}){
 const gesture=useRef<Gesture|null>(null),timer=useRef<number|null>(null),active=useRef<-1|0|1>(0),suppress=useRef(false),[pull,setPull]=useState(0);
 const [heldTarget,setHeldTarget]=useState<'cap'|Direction|null>(null);
 const callbacks=useRef({onUp,onDown,onTurn,onRelease});useEffect(()=>{callbacks.current={onUp,onDown,onTurn,onRelease};},[onUp,onDown,onTurn,onRelease]);
 const stopAction=useCallback(()=>{
  if(timer.current!==null)window.clearTimeout(timer.current);timer.current=null;
  const direction=active.current;active.current=0;if(direction)callbacks.current.onRelease?.(direction);
 },[]);
 const release=useCallback(()=>{gesture.current=null;stopAction();setPull(0);setHeldTarget(null);},[stopAction]);useControlRelease(release);
 useEffect(()=>release,[disabled,release]);
 const fire=(direction:Direction)=>{
  active.current=direction;(direction===1?callbacks.current.onUp:callbacks.current.onDown)();
  if(repeat&&gesture.current?.action===direction)timer.current=window.setTimeout(()=>{if(gesture.current?.action===direction)fire(direction);},350);
 };
 const tap=(direction:Direction)=>{release();fire(direction);if(!latched){setPull(direction);timer.current=window.setTimeout(release,150);}};
 const polar=(e:PointerEvent<HTMLButtonElement>)=>{const r=e.currentTarget.closest('.wheel-assembly')?.getBoundingClientRect();return r&&r.width?Math.atan2(e.clientY-r.y-r.height/2,e.clientX-r.x-r.width/2)*180/Math.PI:NaN;};
 const begin=(e:PointerEvent<HTMLButtonElement>,direction:-1|0|1)=>{
  if(disabled||e.button!==0||gesture.current)return;e.preventDefault();e.stopPropagation();release();suppress.current=false;
  gesture.current={id:e.pointerId,key:null,kind:direction?'step':'cap',angle:polar(e),y:e.clientY,action:direction};e.currentTarget.setPointerCapture?.(e.pointerId);
  setHeldTarget(direction||'cap');
  if(direction){if(!latched)setPull(direction);fire(direction);}
 };
 const finish=(e:PointerEvent<HTMLButtonElement>,cancel=false)=>{
  const held=gesture.current;if(!held||held.id!==e.pointerId)return;e.stopPropagation();release();suppress.current=true;
  if(!cancel&&held.kind==='cap'&&held.action===0)callbacks.current.onTurn();
  if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 };
 const keyDown=(e:React.KeyboardEvent<HTMLButtonElement>,step?:Direction)=>{
  const direction=e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:step&&(e.key===' '||e.key==='Enter')?step:0;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();release();onCancel?.();return;}
  if(!direction)return;e.preventDefault();e.stopPropagation();if(e.repeat||gesture.current)return;release();suppress.current=false;
  gesture.current={id:null,key:e.key,kind:'step',angle:0,y:0,action:direction};setHeldTarget(step??'cap');if(!latched)setPull(direction);fire(direction);
 };
 const keyUp=(e:React.KeyboardEvent<HTMLButtonElement>)=>{if(gesture.current?.key!==e.key)return;e.preventDefault();e.stopPropagation();release();suppress.current=false;};
 const point=(a:number,r=reach)=>({left:`${50+r*Math.cos(a*Math.PI/180)}%`,top:`${50-r*Math.sin(a*Math.PI/180)}%`});
 return <div className="stalk-actuator" data-latched={latched} data-detent={latched?detent:pull} style={{transform:`rotate(${(latched?detent:pull)*12}deg)`}}>
  <span className="column-stalk-rod" style={{'--stalk-angle':`${-angle}deg`,width:`${reach}%`} as CSSProperties} aria-hidden="true"><i/></span>
  <button type="button" className="column-stalk-cap" disabled={disabled} data-held={heldTarget==='cap'} aria-label={label} title={`${label}: hold a direction or drag; center changes mode`} style={{...point(angle),'--stalk-tangent':`${90-angle}deg`} as CSSProperties}
   onContextMenu={e=>e.preventDefault()} onPointerDown={e=>begin(e,0)}
   onPointerMove={e=>{const held=gesture.current;if(!held||held.id!==e.pointerId||held.kind!=='cap')return;e.stopPropagation();const a=polar(e),delta=Number.isFinite(a)&&Number.isFinite(held.angle)?((a-held.angle+540)%360)-180:held.y-e.clientY,direction=Math.abs(delta)<9?0:delta>0?1:-1;
    if(direction===held.action)return;stopAction();held.action=direction;if(!latched)setPull(direction);if(direction)fire(direction);}}
   onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)} onBlur={release}
   onClick={()=>{if(suppress.current){suppress.current=false;return;}onTurn();}} onKeyDown={e=>keyDown(e)} onKeyUp={keyUp}>
   <img src={`/images/${asset}`} alt=""/><span>{mode}</span>
  </button>
  {([1,-1] as const).map((direction,i)=>{const a=angle-direction*spacing;return <button key={direction} type="button" className="stalk-step" disabled={disabled} data-held={heldTarget===direction} aria-label={`${label} ${direction===1?'up':'down'}`} style={{...point(a,stepReach),transform:`translate(-50%,-50%) rotate(${90-a}deg)`}}
   onContextMenu={e=>e.preventDefault()} onPointerDown={e=>begin(e,direction)} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)} onBlur={release}
   onKeyDown={e=>keyDown(e,direction)} onKeyUp={keyUp} onClick={()=>{if(suppress.current){suppress.current=false;return;}tap(direction);}}>{words[i]}</button>;})}
 </div>;
}
export const ColumnStalks=memo(function ColumnStalks(){
 const state=useCockpitState(),flags=useInputStore(s=>s.input.vehicleMask);
 const clearWasher=useCallback(()=>{const s=useInputStore.getState();if((s.input.cockpit_mask??0)&4096)s.setCockpit({washer:false},5);},[]);useControlRelease(clearWasher);
 const detent=hasFlag(flags,VehicleFlags.BLINKER_RIGHT)?1:hasFlag(flags,VehicleFlags.BLINKER_LEFT)?-1:0;
 const turn=(direction:Direction)=>{const store=useInputStore.getState(),f=store.input.vehicleMask,current=hasFlag(f,VehicleFlags.BLINKER_RIGHT)?1:hasFlag(f,VehicleFlags.BLINKER_LEFT)?-1:0,next=Math.max(-1,Math.min(1,current+direction));store.setInput({vehicleMask:setFlag(setFlag(f,VehicleFlags.BLINKER_LEFT,next===-1),VehicleFlags.BLINKER_RIGHT,next===1)});};
 const change=useInputStore.getState().setCockpit;
 return <div className="column-stalks" role="group" aria-label="Steering column controls">
  <Stalk angle={120} label="Lights and turn signal stalk" words={['R','L']} asset="headlights.svg" mode={['OFF','AUTO','ON','HIGH'][state.confirmed.lights]} disabled={!state.supported} latched detent={detent} onUp={()=>turn(1)} onDown={()=>turn(-1)} onTurn={()=>change({lights:(state.current.lights+1)%3},6)} onCancel={()=>useInputStore.getState().setInput({vehicleMask:flags&~(VehicleFlags.BLINKER_LEFT|VehicleFlags.BLINKER_RIGHT)})}/>
  <Stalk angle={60} label="Wiper and washer stalk" words={['WASH','WIPE']} asset="windshield-wiper.svg" mode={['OFF','SLOW','MID','HIGH'][state.confirmed.wipers]} disabled={!state.extended} onUp={()=>change({washer:true},5)} onDown={()=>change({},10)} onRelease={direction=>{if(direction===1)clearWasher();}} onTurn={()=>change({wipers:(state.current.wipers+1)%4},7)}/>
  <Stalk angle={305} reach={28} stepReach={32} spacing={18} label="Cruise control stalk" words={['RES+','SET−']} asset="cruise-control.svg" mode={state.confirmed.cruiseEnabled?'ON':'OFF'} disabled={!state.extended} repeat onUp={()=>change({},8)} onDown={()=>change({},9)} onTurn={()=>change({cruiseEnabled:!state.current.cruiseEnabled,cruiseAction:0},4)} onCancel={()=>change({cruiseAction:3},4)}/>
 </div>;
});
