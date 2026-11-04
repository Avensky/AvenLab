import {useRenderSettingsStore} from '../../store/presentation/renderSettingsStore';
import type {CSSProperties,ReactNode} from 'react';
import './progressOrbit.css';
/** Original Hero hold arc and rotating trail, scaled together inside a fixed slot.
 * Progress is elapsed hold time or recovered server cooldown, never a CSS timer. */
export function ProgressOrbit({progress,children,className='',label='Action progress',layered=false}:{progress:number|null;children?:ReactNode;className?:string;label?:string;layered?:boolean}){
 const detail=useRenderSettingsStore(s=>!s.lowDetail);
 const value=progress===null?0:Math.max(0,Math.min(1,progress));
 return <span className={`action-progress-orbit ${className}`} data-layered={layered} data-progress={progress??'unknown'} data-ready={progress===1} aria-label={label} style={{'--orbit-progress':value,'--orbit-turn':`${value*360}deg`} as CSSProperties}>
  <span className="action-orbit-art" aria-hidden="true">
   {detail && <span className="action-orbit-halo"/>}
   <svg viewBox="0 0 64 64">
    {layered && detail && <circle className="action-orbit-gap" cx="32" cy="32" r="24"/>}
    <circle className="action-orbit-track" cx="32" cy="32" r={layered?29:27}/>
    <circle className="action-orbit-fill" cx="32" cy="32" r={layered?29:27} pathLength="1" strokeDasharray="1"
      strokeDashoffset={1-value} transform="rotate(-90 32 32)"/>
    {layered && <>
     <circle className="action-orbit-inner-track" cx="32" cy="32" r="18.5"/>
     <circle className="action-orbit-inner-fill" cx="32" cy="32" r="18.5" pathLength="1" strokeDasharray="1"
       strokeDashoffset={value-1} transform="rotate(-90 32 32)"/>
     <circle className="action-orbit-spark" cx="32" cy="3" r="2.3" transform={`rotate(${value*360} 32 32)`}/>
     {detail && <circle className="action-orbit-white-border" cx="32" cy="32" r="24"/>}
    </>}
   </svg>
  </span>
  {children}
 </span>;
}
