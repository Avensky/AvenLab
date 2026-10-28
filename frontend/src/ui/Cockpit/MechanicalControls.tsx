import { useCallback, useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import { selectDriveGear } from "../../controls/drivetrainActions";
import { inNeutralLane,parkingLeverPose,shiftKnobRoute } from "./controlGeometry";
import { usePreferencesStore } from "../../store/preferencesStore";
import { useInputStore } from "../../store/inputStore";
import { useControlRelease } from "../../controls/useControlRelease";

const manual = [{gear:7,label:"R",x:12,y:25},{gear:1,label:"1",x:36,y:25},{gear:3,label:"3",x:61,y:25},{gear:5,label:"5",x:86,y:25},
  {gear:0,label:"N",x:61,y:51},{gear:2,label:"2",x:36,y:78},{gear:4,label:"4",x:61,y:78},{gear:6,label:"6",x:86,y:78}];
const automaticSlots = [{gear:8,label:"P",x:50,y:17},{gear:7,label:"R",x:50,y:39},{gear:0,label:"N",x:50,y:61},{gear:1,label:"D",x:50,y:83}];

export function GearSelector({ automatic, gear, disabled, pending }: { automatic:boolean; gear:number; disabled:boolean; pending:boolean }) {
  const reduced=usePreferencesStore(s=>s.reducedMotion);
  const animation=useRef<Animation|null>(null);
  const slots = automatic ? automaticSlots : manual;
  const selection=automatic&&gear>0&&gear<7?1:gear;
  const position = slots.find(slot=>slot.gear===selection) ?? slots[0];
  const gate = useRef<HTMLDivElement>(null), knob = useRef<HTMLButtonElement>(null), drag = useRef<{id:number;x:number;y:number;moved:boolean;neutral:boolean}|null>(null);
  const select = (next:number) => selectDriveGear(next);
  const shown=useRef(position);
  const reset = () => { if(knob.current){knob.current.style.left=`${position.x}%`;knob.current.style.top=`${position.y}%`;} };
  useEffect(()=>{
    const node=knob.current;if(!node||drag.current)return;
    const from=shown.current;animation.current?.cancel();node.style.left=`${position.x}%`;node.style.top=`${position.y}%`;
    if(!reduced&&node.animate&&(from.x!==position.x||from.y!==position.y)){
      const rect=gate.current!.getBoundingClientRect();
      animation.current=node.animate(shiftKnobRoute(from,position,automatic).map(point=>({transform:`translate(-50%, -50%) translate(${(point.x-position.x)*rect.width/100}px, ${(point.y-position.y)*rect.height/100}px)`})),{duration:260,easing:'ease-in-out'});
    }
    shown.current=position;return()=>animation.current?.cancel();
  },[position,automatic,reduced]);
  const finish = (event:PointerEvent<HTMLButtonElement>,cancel=false) => {
    const current=drag.current;if(!current||current.id!==event.pointerId)return;drag.current=null;
    if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(cancel||!current.moved){reset();return;}
    const rect=gate.current!.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*100,y=(event.clientY-rect.top)/rect.height*100;
    const nearest=slots.reduce((best,slot)=>(slot.x-x)**2+(slot.y-y)**2<(best.x-x)**2+(best.y-y)**2?slot:best);
    const next=!automatic&&inNeutralLane(y)?0:nearest.gear;
    const target=slots.find(slot=>slot.gear===next)!;shown.current=target;
    if(knob.current){knob.current.style.left=`${target.x}%`;knob.current.style.top=`${target.y}%`;}
    if(next!==0||!current.neutral)select(next);
  };
  return <section className="mechanical-shifter" aria-label="Gear selector">

    <div className="shift-gate" ref={gate} data-automatic={automatic} aria-busy={pending}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path vectorEffect="non-scaling-stroke" d={automatic?"M50 17V83":"M12 25V51H86M36 25V78M61 25V78M86 25V78"}/></svg>
      {slots.map(slot=><button className="shift-slot" key={slot.gear} disabled={disabled} aria-label={`Select ${slot.label==='R'?'reverse':slot.label==='N'?'neutral':slot.label==='P'?'park':slot.label==='D'?'drive':`gear ${slot.label}`}`} aria-current={selection===slot.gear?"true":undefined} style={{left:`${slot.x}%`,top:`${slot.y}%`}} onClick={()=>select(slot.gear)}>{slot.label}</button>)}
      <button className="shift-knob" ref={knob} disabled={disabled} tabIndex={-1} aria-label="Drag gear stick" title="Drag to a gear, or select its slot"
        style={{left:`${position.x}%`,top:`${position.y}%`}}
        onPointerDown={event=>{if(event.button!==0||drag.current)return;animation.current?.cancel();drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,neutral:false};event.currentTarget.setPointerCapture?.(event.pointerId);}}
        onPointerMove={event=>{const current=drag.current;if(!current||current.id!==event.pointerId)return;
          current.moved ||= Math.hypot(event.clientX-current.x,event.clientY-current.y)>5;if(!current.moved)return;
          const rect=gate.current!.getBoundingClientRect(),y=(event.clientY-rect.top)/rect.height*100;
          if(!automatic&&inNeutralLane(y)){if(!current.neutral)select(0);current.neutral=true;}else current.neutral=false;
          event.currentTarget.style.left=`${Math.max(8,Math.min(90,(event.clientX-rect.left)/rect.width*100))}%`;
          event.currentTarget.style.top=`${Math.max(12,Math.min(88,(event.clientY-rect.top)/rect.height*100))}%`;}}
        onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)}><span>{automatic?position.label:"R 1 3 5"}<br/>{automatic?"AUTO":"  2 4 6"}</span></button>
    </div>
    <small>{pending?"SHIFT REQUESTED":automatic?"AUTOMATIC":"H-PATTERN · AUTO ASSIST"}</small>
  </section>;
}

export function HandbrakeLever({ strength, disabled, pending }: {strength:number;disabled:boolean;pending:boolean}) {
  const handle=useRef<HTMLSpanElement>(null),start=useRef<{id:number|null;key:string|null;y:number;level:number;charged:boolean;moved:boolean}|null>(null),suppressClick=useRef(false),timer=useRef<number|null>(null);
  const pose=parkingLeverPose(strength);
  const set=useCallback((level:number)=>useInputStore.getState().setCockpit({parking:level>0,parkingStrength:level},3),[]);
  const clear=useCallback(()=>{if(timer.current!==null)window.clearTimeout(timer.current);timer.current=null;if(start.current)suppressClick.current=true;start.current=null;if(handle.current)handle.current.style.removeProperty('transform');},[]);
  useControlRelease(clear);useEffect(()=>{if(disabled)clear();},[disabled,clear]);
  const charge=()=>{const held=start.current;if(!held||held.moved)return;held.charged=true;const next=Math.min(3,held.level+1);if(next!==held.level){held.level=next;set(next);}timer.current=next<3?window.setTimeout(charge,300):null;};
  const begin=(id:number|null,key:string|null,y=0)=>{if(disabled||start.current)return;suppressClick.current=false;start.current={id,key,y,level:strength,charged:false,moved:false};timer.current=window.setTimeout(charge,250);};
  const finish=(event:PointerEvent<HTMLButtonElement>,cancel=false)=>{
    const current=start.current;if(!current||current.id!==event.pointerId)return;start.current=null;
    clear();suppressClick.current=true;
    if(!cancel&&!current.charged&&!current.moved)set(0);
    if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(current.moved&&!cancel)set(Math.max(0,Math.min(3,current.level+Math.round((current.y-event.clientY)/28))));
  };
  return <section className="mechanical-handbrake" style={{'--parking-level':strength,'--parking-angle':`${pose.angle}deg`,'--parking-reach':pose.reach} as CSSProperties}><div className="parking-levels" role="group" aria-label="Parking brake levels">{[3,2,1].map(level=><button type="button" key={level} disabled={disabled} aria-label={`Parking brake ${Math.round(level/3*100)} percent`} title={`Parking brake ${Math.round(level/3*100)} percent`} aria-pressed={strength===level} data-filled={strength>=level} onClick={()=>set(level)}><svg className="parking-crystal" viewBox="0 0 12 16" aria-hidden="true"><path d="M6 1L10 5 10 11 6 15 2 11 2 5Z"/></svg></button>)}</div><button type="button" className="handbrake-lever" disabled={disabled} aria-label="Parking brake" aria-description={`${Math.round(strength/3*100)} percent; hold to increase brake strength, tap to release`} aria-pressed={strength>0} data-active={strength>0} aria-busy={pending}
    onClick={event=>{event.stopPropagation();if(suppressClick.current){suppressClick.current=false;return;}set(0);}}
    onPointerDown={event=>{if(event.button!==0||start.current)return;event.preventDefault();event.stopPropagation();begin(event.pointerId,null,event.clientY);event.currentTarget.setPointerCapture?.(event.pointerId);}}
    onPointerMove={event=>{const current=start.current;if(!current||current.id!==event.pointerId)return;const dy=current.y-event.clientY;current.moved ||= Math.abs(dy)>8;
      if(current.moved){if(timer.current!==null)window.clearTimeout(timer.current);timer.current=null;if(handle.current){const next=parkingLeverPose(current.level+dy/28);handle.current.style.transform=`rotate(${next.angle}deg) scaleX(${next.reach})`;}}}}
    onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)} onBlur={clear}
    onKeyDown={event=>{if(event.code==='Space'||event.code==='Enter'){event.preventDefault();event.stopPropagation();if(!event.repeat)begin(null,event.code);}}}
    onKeyUp={event=>{if(event.code==='Space'||event.code==='Enter'){event.preventDefault();event.stopPropagation();const held=start.current;if(held?.key===event.code){const charged=held.charged;clear();suppressClick.current=false;if(!charged)set(0);}}}}>
    <span className="ebrake-floor"/><span className="ebrake-base"/><span className="ebrake-handle" ref={handle}><i/></span>
  </button><small>{pending?"BRAKE REQUESTED":"REAR PARKING BRAKE"}</small></section>;
}
