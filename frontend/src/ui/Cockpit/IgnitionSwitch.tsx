import {useCallback,useEffect,useId,useRef,useState,type PointerEvent} from 'react';
import {useInputStore} from '../../store/inputStore';
import {useCockpitState} from './useCockpitState';
import {useControlRelease} from '../../controls/useControlRelease';
const angles=[-135,-90,-45,0],positions=['OFF','ACC','ON','START'];
type Press={id:number|null;key:string|null;angle:number;initial:number;phase:number;advanced:boolean;dragged:boolean};

export function IgnitionSwitch(){
 const {extended,confirmedCabin:state,cabinMask}=useCockpitState();
 const gradient=useId().replaceAll(':',''),press=useRef<Press|null>(null),timer=useRef<number|null>(null),suppress=useRef(false);
 const [heldPhase,setHeldPhase]=useState<number|null>(null);
 const clearTimer=useCallback(()=>{if(timer.current!==null)window.clearTimeout(timer.current);timer.current=null;},[]);
 const release=useCallback(()=>{
  clearTimer();const held=press.current;press.current=null;setHeldPhase(null);
  if(held)suppress.current=true;
  const store=useInputStore.getState();
  if(((store.input.cabin_mask??0)>>>10&3)===3)store.setIgnition(2,true);
 },[clearTimer]);
 useControlRelease(release);useEffect(()=>release,[extended,release]);
 const send=(phase:number,inserted=true)=>useInputStore.getState().setIgnition(phase,inserted,cabinMask??undefined);
 const off=()=>{release();send(0);};
 const advance=()=>{
  const held=press.current;if(!held)return;
  held.advanced=true;held.phase=Math.min(3,held.phase+1);setHeldPhase(held.phase);send(held.phase);
  timer.current=held.phase<3?window.setTimeout(advance,300):null;
 };
 const begin=(id:number|null,key:string|null,angle=0)=>{
  if(!extended||press.current)return;
  clearTimer();suppress.current=false;
  const phase=Math.min(2,state.ignition);
  press.current={id,key,angle,initial:phase,phase,advanced:false,dragged:false};setHeldPhase(phase);
  timer.current=window.setTimeout(advance,250);
 };
 const choose=(phase:number)=>{release();send(phase);if(phase===3)timer.current=window.setTimeout(release,1000);};
 const angle=(e:PointerEvent<HTMLButtonElement>)=>{const r=e.currentTarget.getBoundingClientRect();return Math.atan2(e.clientY-r.y-r.height/2,e.clientX-r.x-r.width/2)*180/Math.PI;};
 const finish=(e:PointerEvent<HTMLButtonElement>,cancel=false)=>{
  const held=press.current;if(!held||held.id!==e.pointerId)return;
  const tap=!held.advanced&&!held.dragged;release();
  if(!cancel&&tap)send(0);
  if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 };
 const shown=heldPhase??state.ignition;
 return <div className="ignition-system" data-ignition={positions[shown]} data-key-inserted={heldPhase!==null||state.keyInserted} data-holding={heldPhase!==null}>
  <button type="button" className="ignition-cylinder" disabled={!extended} aria-label="Ignition key"
   aria-description="Tap to switch off. Hold to turn through ACC, ON and START. Releasing START returns to ON. Arrow keys select a position; Home switches off and Delete removes the key while off."
   onContextMenu={e=>e.preventDefault()} onClick={e=>{e.stopPropagation();if(suppress.current){suppress.current=false;return;}off();}}
   onPointerDown={e=>{if(e.button!==0||press.current)return;e.preventDefault();e.stopPropagation();begin(e.pointerId,null,angle(e));e.currentTarget.setPointerCapture?.(e.pointerId);}}
   onPointerMove={e=>{const held=press.current;if(!held||held.id!==e.pointerId)return;e.stopPropagation();const delta=((angle(e)-held.angle+540)%360)-180;if(Math.abs(delta)<=10)return;
    clearTimer();held.dragged=true;held.advanced=true;const phase=Math.max(0,Math.min(3,held.initial+Math.round(delta/45)));
    if(phase!==held.phase){held.phase=phase;setHeldPhase(phase);send(phase);}}}
   onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)} onBlur={release}
   onKeyDown={e=>{
    if(e.key===' '||e.key==='Enter'){e.preventDefault();e.stopPropagation();if(!e.repeat)begin(null,e.key);return;}
    const dir=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;
    if(dir||['Home','End','Delete'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.repeat)return;
     if(e.key==='Delete'){if(state.ignition===0){release();send(0,!state.keyInserted);}}
     else choose(e.key==='Home'?0:e.key==='End'?3:Math.max(0,Math.min(3,state.ignition+dir)));}
   }}
   onKeyUp={e=>{if(e.key!==' '&&e.key!=='Enter')return;e.preventDefault();e.stopPropagation();const held=press.current;if(held?.key===e.key){const tap=!held.advanced;release();suppress.current=false;if(tap)send(0);}}}>
   <svg viewBox="0 0 120 120" aria-hidden="true"><defs><radialGradient id={gradient}><stop stopColor="#303d49"/><stop offset=".68" stopColor="#07111a"/><stop offset=".73" stopColor="#c0c9ce"/><stop offset=".9" stopColor="#4f5b64"/><stop offset="1" stopColor="#111820"/></radialGradient></defs>
    <circle cx="60" cy="60" r="43" fill={`url(#${gradient})`} stroke="#9ba8b0"/>
    {positions.map((label,i)=>{const a=angles[i]*Math.PI/180;return <g key={label} data-key-position={i}>
     <path d={`M${60+43*Math.cos(a)} ${60+43*Math.sin(a)}L${60+48*Math.cos(a)} ${60+48*Math.sin(a)}`} stroke={heldPhase!==null&&shown>=i?'#abe6f6':'#7e919e'} strokeWidth="2"/>
     <text transform={`translate(${60+54*Math.cos(a)} ${60+54*Math.sin(a)}) rotate(${angles[i]+90})`} textAnchor="middle" dominantBaseline="middle" fill={heldPhase!==null&&shown===i?'#d3f5ff':'#c0ced7'} fontSize="6">{label}</text>
    </g>;})}
    <path className="key-travel" d="M25 25A49.5 49.5 0 0 1 109.5 60" fill="none" pathLength="3" stroke="#9ae6ff" strokeWidth="2" strokeDasharray="3" strokeDashoffset={3-shown}/>
    <path d="M58 50v20h4V50z" fill="#03090e" stroke="#657680"/>
    {(state.keyInserted||heldPhase!==null)&&<g className="radial-key" transform={`rotate(${angles[shown]} 60 60)`}><path d="M50 57h39v6H76l-4-3-4 3H50z" fill="#bcc8ce"/><rect x="36" y="50" width="24" height="20" rx="4" fill="#1a242e" stroke="#77858e"/><path d="M41 54h14v12H41z" fill="none" stroke="#3e4c57"/></g>}
   </svg>
  </button>
 </div>;
}
