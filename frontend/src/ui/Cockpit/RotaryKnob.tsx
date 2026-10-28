import {useRef,useState,type PointerEvent} from "react";
export function RotaryKnob({label,value,min,max,onChange,readout,action,onAction,active,disabled=false,actionText}:{label:string;value:number;min:number;max:number;onChange:(value:number)=>void;readout:string;action:string;onAction:()=>void;active:boolean;disabled?:boolean;actionText?:string}) {
 const drag=useRef<{id:number;angle:number;value:number;moved:boolean}|null>(null),[turning,setTurning]=useState(false);
 const angle=(e:PointerEvent<HTMLDivElement>)=>{const r=e.currentTarget.getBoundingClientRect();return Math.atan2(e.clientY-r.y-r.height/2,e.clientX-r.x-r.width/2)*180/Math.PI;};
 const finish=(e:PointerEvent<HTMLDivElement>)=>{if(drag.current?.id!==e.pointerId)return;const moved=drag.current.moved;drag.current=null;setTurning(false);if(!moved&&!disabled)onChange(value>=max?min:value+1);};
 return <div className="climate-knob" role="slider" tabIndex={disabled?-1:0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={readout} aria-disabled={disabled} data-turning={turning}
  onPointerDown={e=>{if(disabled||e.button!==0||drag.current)return;drag.current={id:e.pointerId,angle:angle(e),value,moved:false};e.currentTarget.setPointerCapture?.(e.pointerId);}}
  onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const delta=((angle(e)-d.angle+540)%360)-180;if(Math.abs(delta)>9){d.moved=true;setTurning(true);onChange(Math.max(min,Math.min(max,d.value+Math.round(delta/24))));}}}
  onPointerUp={finish} onPointerCancel={()=>{drag.current=null;setTurning(false);}} onLostPointerCapture={()=>{drag.current=null;setTurning(false);}}
  onKeyDown={e=>{if(disabled)return;const step=['ArrowUp','ArrowRight'].includes(e.key)?1:['ArrowDown','ArrowLeft'].includes(e.key)?-1:0;if(step||['Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();onChange(e.key==='Home'?min:e.key==='End'?max:Math.max(min,Math.min(max,value+step)));}}}>
  <span className="knob-title">{label}</span><span className="knob-ring" aria-hidden="true"/><span className="knob-pointer" aria-hidden="true" style={{transform:`rotate(${-130+(value-min)/(max-min)*260}deg)`}}/>
  <button type="button" disabled={disabled} aria-label={action} aria-pressed={active} onPointerDown={e=>e.stopPropagation()} onClick={onAction}>{actionText??action}</button><output>{readout}</output>
 </div>;
}
