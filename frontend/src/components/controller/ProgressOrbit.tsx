import type {CSSProperties,ReactNode} from 'react';
import './progressOrbit.css';
/** Original Hero hold arc and rotating trail, scaled together inside a fixed slot.
 * Progress is elapsed hold time or recovered server cooldown, never a CSS timer. */
export function ProgressOrbit({progress,children,className='',label='Action progress'}:{progress:number|null;children?:ReactNode;className?:string;label?:string}){
 const value=progress===null?0:Math.max(0,Math.min(1,progress));
 return <span className={`action-progress-orbit ${className}`} data-progress={progress??'unknown'} data-ready={progress===1} aria-label={label} style={{'--orbit-progress':value,'--orbit-turn':`${value*360}deg`} as CSSProperties}>
  <span className="action-orbit-art" aria-hidden="true"><span className="action-orbit-halo"/><svg viewBox="0 0 64 64"><circle className="action-orbit-track" cx="32" cy="32" r="27"/><circle className="action-orbit-fill" cx="32" cy="32" r="27" pathLength="1" strokeDasharray="1" strokeDashoffset={1-value} transform="rotate(-90 32 32)"/></svg></span>{children}
 </span>;
}
