import {useCallback,useEffect,useRef,type KeyboardEvent,type MouseEvent,type PointerEvent} from 'react';
import {useControlRelease} from '../../controls/useControlRelease';

// One delegated owner per surface. Feedback never changes the command or its
// confirmed on/off state, and pointer motion does not schedule React renders.
export function useMomentaryFeedback() {
 const held=useRef(new Map<string,HTMLElement>());
 const clear=useCallback(()=>{for(const node of held.current.values())node.removeAttribute('data-hud-held');held.current.clear();},[]);
 const release=useCallback((key:string)=>{
  const node=held.current.get(key);held.current.delete(key);
  if(node&&![...held.current.values()].includes(node))node.removeAttribute('data-hud-held');
 },[]);
 useControlRelease(clear);
 useEffect(()=>{
  const pointer=(event:globalThis.PointerEvent)=>release(`p${event.pointerId}`);
  const key=(event:globalThis.KeyboardEvent)=>release(`k${event.code||event.key}`);
  window.addEventListener('pointerup',pointer,true);window.addEventListener('pointercancel',pointer,true);window.addEventListener('lostpointercapture',pointer,true);window.addEventListener('keyup',key,true);
  return()=>{window.removeEventListener('pointerup',pointer,true);window.removeEventListener('pointercancel',pointer,true);window.removeEventListener('lostpointercapture',pointer,true);window.removeEventListener('keyup',key,true);clear();};
 },[clear,release]);
 const target=(event:{target:EventTarget;currentTarget:HTMLElement})=>{
  const node=(event.target as Element).closest?.<HTMLElement>('button,[role="slider"]');
  return node&&node.closest('[data-momentary-controls]')===event.currentTarget&&!node.matches(':disabled,[aria-disabled="true"]')?node:null;
 };
 const preventFocus=(event:PointerEvent<HTMLElement>|MouseEvent<HTMLElement>)=>{
  const node=target(event);if(!node)return null;event.preventDefault();
  const focused=document.activeElement;if(focused instanceof HTMLElement&&event.currentTarget.contains(focused))focused.blur();return node;
 };
 return {
  'data-momentary-controls':true,
  onPointerDownCapture:(event:PointerEvent<HTMLElement>)=>{if(event.button!==0)return;const node=preventFocus(event);if(node){held.current.set(`p${event.pointerId}`,node);node.setAttribute('data-hud-held','true');}},
  onMouseDownCapture:(event:MouseEvent<HTMLElement>)=>{if(event.button===0)preventFocus(event);},
  onKeyDownCapture:(event:KeyboardEvent<HTMLElement>)=>{
   const node=target(event);if(!node)return;
   const action=event.key===' '||event.key==='Enter',turn=node.getAttribute('role')==='slider'&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key);
   if(action||turn){held.current.set(`k${event.code||event.key}`,node);node.setAttribute('data-hud-held','true');}
  },
 };
}
