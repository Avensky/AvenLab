import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import { useInputStore } from "../../store/inputStore";

const manual = [{gear:7,label:"R",x:12,y:25},{gear:1,label:"1",x:36,y:25},{gear:3,label:"3",x:61,y:25},{gear:5,label:"5",x:86,y:25},
  {gear:0,label:"N",x:61,y:51},{gear:2,label:"2",x:36,y:78},{gear:4,label:"4",x:61,y:78},{gear:6,label:"6",x:86,y:78}];
const automaticSlots = [{gear:8,label:"P",x:50,y:17},{gear:7,label:"R",x:50,y:39},{gear:0,label:"N",x:50,y:61},{gear:1,label:"D",x:50,y:83}];

export function GearSelector({ automatic, gear, actualGear, disabled, pending }: { automatic:boolean; gear:number; actualGear:number|null; disabled:boolean; pending:boolean }) {
  const slots = automatic ? automaticSlots : manual;
  const position = slots.find(slot=>slot.gear===gear) ?? slots[0];
  const gate = useRef<HTMLDivElement>(null), knob = useRef<HTMLButtonElement>(null), drag = useRef<{id:number;x:number;y:number;moved:boolean}|null>(null);
  const select = (next:number) => useInputStore.getState().setCockpit({gear:next, parking:next===8},2);
  const reset = () => { if(knob.current){knob.current.style.left=`${position.x}%`;knob.current.style.top=`${position.y}%`;} };
  useEffect(()=>{if(knob.current){knob.current.style.left=`${position.x}%`;knob.current.style.top=`${position.y}%`;}},[position.x,position.y]);
  const finish = (event:PointerEvent<HTMLButtonElement>,cancel=false) => {
    const current=drag.current;if(!current||current.id!==event.pointerId)return;drag.current=null;
    if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(cancel||!current.moved){reset();return;}
    const rect=gate.current!.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*100,y=(event.clientY-rect.top)/rect.height*100;
    const nearest=slots.reduce((best,slot)=>(slot.x-x)**2+(slot.y-y)**2<(best.x-x)**2+(best.y-y)**2?slot:best);
    reset();select(nearest.gear);
  };
  return <section className="mechanical-shifter" aria-label="Gear selector">
    <div className="cockpit-segments"><button aria-pressed={automatic} disabled={disabled} onClick={()=>useInputStore.getState().setCockpit({automatic:true,gear:1,parking:false},2)}>AUTO</button><button aria-pressed={!automatic} disabled={disabled} onClick={()=>useInputStore.getState().setCockpit({automatic:false,gear:actualGear===-1?7:Math.max(0,Math.min(6,actualGear??0)),parking:false},2)}>MANUAL</button></div>
    <div className="shift-gate" ref={gate} data-automatic={automatic} data-pending={pending}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path vectorEffect="non-scaling-stroke" d={automatic?"M50 17V83":"M12 25V51H86M36 25V78M61 25V78M86 25V78"}/></svg>
      {slots.map(slot=><button className="shift-slot" key={slot.gear} disabled={disabled} aria-label={`Select ${slot.label==='R'?'reverse':slot.label==='N'?'neutral':slot.label==='P'?'park':slot.label==='D'?'drive':`gear ${slot.label}`}`} aria-pressed={gear===slot.gear} style={{left:`${slot.x}%`,top:`${slot.y}%`}} onClick={()=>select(slot.gear)}>{slot.label}</button>)}
      <button className="shift-knob" ref={knob} disabled={disabled} tabIndex={-1} aria-label="Drag gear stick" title="Drag to a gear, or select its slot"
        style={{left:`${position.x}%`,top:`${position.y}%`}}
        onPointerDown={event=>{if(event.button!==0||drag.current)return;drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};event.currentTarget.setPointerCapture?.(event.pointerId);}}
        onPointerMove={event=>{const current=drag.current;if(!current||current.id!==event.pointerId)return;
          current.moved ||= Math.hypot(event.clientX-current.x,event.clientY-current.y)>5;if(!current.moved)return;
          const rect=gate.current!.getBoundingClientRect();event.currentTarget.style.left=`${Math.max(8,Math.min(90,(event.clientX-rect.left)/rect.width*100))}%`;
          event.currentTarget.style.top=`${Math.max(12,Math.min(88,(event.clientY-rect.top)/rect.height*100))}%`;}}
        onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)}><span>{automatic?position.label:"R 1 3 5"}<br/>{automatic?"AUTO":"  2 4 6"}</span></button>
    </div>
    <small>{pending?"SHIFT REQUESTED":automatic?"AUTOMATIC":"ASSISTED MANUAL"}</small>
  </section>;
}

export function HandbrakeLever({ strength, disabled, pending }: {strength:number;disabled:boolean;pending:boolean}) {
  const handle=useRef<HTMLSpanElement>(null),start=useRef<{id:number;y:number;moved:boolean}|null>(null),suppressClick=useRef(false);
  const set=(level:number)=>useInputStore.getState().setCockpit({parking:level>0,parkingStrength:level},3);
  const finish=(event:PointerEvent<HTMLButtonElement>,cancel=false)=>{
    const current=start.current;if(!current||current.id!==event.pointerId)return;start.current=null;
    if(handle.current)handle.current.style.removeProperty('transform');
    if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(current.moved&&!cancel){suppressClick.current=true;set(Math.max(0,Math.min(3,strength+Math.round((current.y-event.clientY)/28))));}
  };
  return <section className="mechanical-handbrake" style={{'--parking-level':strength} as CSSProperties}><button className="handbrake-lever" disabled={disabled} aria-label="Parking brake" aria-description={`${Math.round(strength/3*100)} percent; activate to increase one step`} aria-pressed={strength>0} data-active={strength>0} data-pending={pending}
    onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}set((strength+1)%4);}}
    onPointerDown={event=>{if(event.button!==0||start.current)return;suppressClick.current=false;start.current={id:event.pointerId,y:event.clientY,moved:false};event.currentTarget.setPointerCapture?.(event.pointerId);}}
    onPointerMove={event=>{const current=start.current;if(!current||current.id!==event.pointerId)return;const dy=current.y-event.clientY;current.moved ||= Math.abs(dy)>8;
      if(current.moved&&handle.current)handle.current.style.transform=`rotate(${Math.max(-66,Math.min(0,-strength*22-dy*.7))}deg)`;}}
    onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)}>
    <span className="ebrake-base"/><span className="ebrake-handle" ref={handle}><i/></span><span className="ebrake-indicator">BRAKE</span>
  </button><div className="parking-levels" role="group" aria-label="Parking brake levels">{[0,1,2,3].map(level=><button type="button" key={level} disabled={disabled} aria-label={`Parking brake ${Math.round(level/3*100)} percent`} aria-pressed={strength===level} onClick={()=>set(level)}>{level===0?'OFF':`${Math.round(level/3*100)}%`}</button>)}</div><small>{pending?"BRAKE REQUESTED":"REAR PARKING BRAKE"}</small></section>;
}
