import { useCallback, useEffect, useRef, useState } from "react";
import { ControllerAction } from "../../components/controller";
import { HoldToConfirm } from "./holdToConfirm";

/** Pointer, keyboard X and the existing gamepad input owner share one latch.
 * Merely clicking, focusing or editing never invokes onComplete. */
export function HoldMainButton({disabled,selected,onComplete}:{disabled:boolean;selected:boolean;onComplete:()=>void}) {
 const [progress,setProgress]=useState(0);
 const intent=useRef(new HoldToConfirm()),frame=useRef(0),complete=useRef(onComplete);
 useEffect(()=>{complete.current=onComplete;},[onComplete]);
 const cancel=useCallback(()=>{cancelAnimationFrame(frame.current);intent.current.cancel();setProgress(0);},[]);
 const begin=useCallback((source:string)=>{
  if(disabled||selected||!intent.current.begin(source,performance.now()))return;
  const tick=()=>{const result=intent.current.sample(performance.now());setProgress(result.progress);if(result.justCompleted){complete.current();return;}frame.current=requestAnimationFrame(tick);};
  frame.current=requestAnimationFrame(tick);
 },[disabled,selected]);
 const release=useCallback((source:string)=>{if(intent.current.release(source)){cancelAnimationFrame(frame.current);setProgress(intent.current.sample(performance.now()).progress);}},[]);
 useEffect(()=>{if(disabled||selected){cancelAnimationFrame(frame.current);intent.current.cancel();}},[disabled,selected]);
 useEffect(()=>{
  const currentIntent=intent.current;
  const down=(event:KeyboardEvent)=>{const target=event.target instanceof HTMLElement?event.target:null;if(event.code!=="KeyX"||event.repeat||event.ctrlKey||event.metaKey||event.altKey||target?.matches('input,textarea,select,[contenteditable="true"]'))return;event.preventDefault();begin("keyboard");};
  const up=(event:KeyboardEvent)=>{if(event.code==="KeyX")release("keyboard");};
  const gamepad=(event:Event)=>{const detail=(event as CustomEvent<{pressed:boolean;cancelled?:boolean}>).detail;if(detail.pressed)begin("gamepad");else release("gamepad");};
  const visibility=()=>{if(document.visibilityState!=="visible")cancel();};
  window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("avenlab:hero-main-hold",gamepad);window.addEventListener("blur",cancel);document.addEventListener("visibilitychange",visibility);
  return()=>{cancelAnimationFrame(frame.current);currentIntent.cancel();window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("avenlab:hero-main-hold",gamepad);window.removeEventListener("blur",cancel);document.removeEventListener("visibilitychange",visibility);};
 },[begin,release,cancel]);
 const value=selected?1:disabled?0:progress;
 return <ControllerAction button="X" progress={value} progressClassName="hero-main-orbit" type="button" className="hero-main-hold" disabled={disabled} data-main={selected} data-complete={value===1} aria-label={selected?"Main hero selected":"Hold X to set main hero"} title="Hold X, or hold this button, for 1.2 seconds to choose your main hero"
  onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture?.(event.pointerId);begin(`pointer-${event.pointerId}`);}}
  onPointerMove={event=>{if(!event.currentTarget.hasPointerCapture?.(event.pointerId))return;const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)release(`pointer-${event.pointerId}`);}}
  onPointerUp={event=>release(`pointer-${event.pointerId}`)} onPointerCancel={event=>release(`pointer-${event.pointerId}`)} onLostPointerCapture={event=>release(`pointer-${event.pointerId}`)}
  onKeyDown={event=>{if(event.code==="Space"||event.code==="Enter"){event.preventDefault();event.stopPropagation();if(!event.repeat)begin("button-key");}}} onKeyUp={event=>{if(event.code==="Space"||event.code==="Enter")release("button-key");}}>

  <span>{selected?"MAIN SET":value===1?"SETTING MAIN…":"SET MAIN"}</span>
  <span className="hero-hold-accessible" role="progressbar" aria-label="Main hero hold progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value*100)}/>
 </ControllerAction>;
}
