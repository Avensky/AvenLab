import {useCallback,useRef,type PointerEvent} from "react";
import {useInputStore} from "../../store/inputStore";
import {useCockpitState} from "./useCockpitState";
import {useControlRelease} from "../../controls/useControlRelease";
const IGNITION_ANGLES=[-135,-90,-45,0];
const positions=['OFF','ACC','ON','START'];
export function IgnitionSwitch() {
 const {extended,confirmedCabin:state,cabinMask}=useCockpitState();
 const pulse=useRef<number|null>(null),drag=useRef<{id:number;angle:number;position:number;moved:boolean}|null>(null),suppress=useRef(false);
 const send=(position:number,inserted=state.keyInserted)=>useInputStore.getState().setIgnition(position,inserted,cabinMask??undefined);
 const release=useCallback(()=>{if(pulse.current!==null)window.clearTimeout(pulse.current);pulse.current=null;const s=useInputStore.getState();if(((s.input.cabin_mask??0)>>>10&3)===3)s.setIgnition(2,true);drag.current=null;},[]);
 useControlRelease(release);
 const choose=(position:number)=>{if(!extended)return;if(!state.keyInserted){send(0,true);return;}release();send(position);if(position===3)pulse.current=window.setTimeout(release,1000);};
 const angle=(e:PointerEvent<HTMLButtonElement>)=>{const r=e.currentTarget.getBoundingClientRect();return Math.atan2(e.clientY-r.y-r.height/2,e.clientX-r.x-r.width/2)*180/Math.PI;};
 const finish=(e:PointerEvent<HTMLButtonElement>)=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;drag.current=null;if(d.moved){suppress.current=true;release();}};
 return <div className="ignition-system" data-ignition={positions[state.ignition]} data-key-inserted={state.keyInserted}>
  <button type="button" className="ignition-cylinder" disabled={!extended} aria-label="Ignition key" aria-description="Click a marked position, tap to advance or turn clockwise. Arrow keys select; Home switches off. Start springs back to On. Delete removes the key while Off."
   onClick={()=>{if(suppress.current){suppress.current=false;return;}choose((state.ignition+1)%4);}}
   onPointerDown={e=>{if(e.button!==0||drag.current||!state.keyInserted)return;suppress.current=false;drag.current={id:e.pointerId,angle:angle(e),position:state.ignition,moved:false};e.currentTarget.setPointerCapture?.(e.pointerId);}}
   onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const delta=((angle(e)-d.angle+540)%360)-180;if(Math.abs(delta)>10){d.moved=true;send(Math.max(0,Math.min(3,d.position+Math.round(delta/45))));}}}
   onPointerUp={finish} onPointerCancel={release} onLostPointerCapture={finish}
   onKeyDown={e=>{const dir=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(dir||['Home','End','Delete'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='Delete'){if(state.ignition===0)send(0,!state.keyInserted);}else choose(e.key==='Home'?0:e.key==='End'?3:Math.max(0,Math.min(3,state.ignition+dir)));}}}>
   <svg viewBox="0 0 120 120" aria-hidden="true"><defs><radialGradient id="key-metal"><stop stopColor="#303d49"/><stop offset=".68" stopColor="#07111a"/><stop offset=".73" stopColor="#c0c9ce"/><stop offset=".9" stopColor="#4f5b64"/><stop offset="1" stopColor="#111820"/></radialGradient></defs>
    <circle cx="60" cy="60" r="43" fill="url(#key-metal)" stroke="#9ba8b0"/>
    {positions.map((label,i)=>{const a=IGNITION_ANGLES[i]*Math.PI/180;return <g key={label} data-key-position={i} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();choose(i);}}>
     <path d={`M${60+43*Math.cos(a)} ${60+43*Math.sin(a)}L${60+48*Math.cos(a)} ${60+48*Math.sin(a)}`} stroke={state.ignition===i?'#abe6f6':'#7e919e'} strokeWidth="2"/>
     <text transform={`translate(${60+54*Math.cos(a)} ${60+54*Math.sin(a)}) rotate(${IGNITION_ANGLES[i]+90})`} textAnchor="middle" dominantBaseline="middle" fill={state.ignition===i?'#d3f5ff':'#c0ced7'} fontSize="6">{label}</text>
    </g>;})}
    <path d="M58 50v20h4V50z" fill="#03090e" stroke="#657680"/>
    {state.keyInserted&&<g className="radial-key" transform={`rotate(${IGNITION_ANGLES[state.ignition]} 60 60)`}><path d="M50 57h39v6H76l-4-3-4 3H50z" fill="#bcc8ce"/><rect x="36" y="50" width="24" height="20" rx="4" fill="#1a242e" stroke="#77858e"/><path d="M41 54h14v12H41z" fill="none" stroke="#3e4c57"/></g>}
   </svg>
  </button>
 </div>;
}
