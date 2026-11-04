import type {UIState} from '../store/menus/types';

/** Camera gestures belong to bare world canvas, never a menu or scope. The
 * camera owner still decides whether driving/inspection is enabled. */
export function canUseDrivingCamera(ui:Pick<UIState,'screen'|'overlay'|'isModeLoading'>,scope:boolean){
 return ui.screen==='sandbox'&&!ui.isModeLoading&&!scope&&(ui.overlay===null||ui.overlay==='vehicle_select'||ui.overlay==='world_builder');
}

type CameraDragOptions={
 canDrag:()=>boolean;
 onDelta:(dx:number,dy:number)=>void;
 onActiveChange:(active:boolean)=>void;
};

/** One pointer owns a drag. Primary mouse input also covers trackpad clicks;
 * right dragging and touch keep their previous behavior. Canvas-only listeners
 * prevent HUD controls from becoming camera gestures. */
export function bindCameraDrag(element:HTMLCanvasElement,{canDrag,onDelta,onActiveChange}:CameraDragOptions){
 let pointer:number|null=null;
 let previous={x:0,y:0};
 const view=element.ownerDocument.defaultView!;
 const release=()=>{
  const id=pointer;pointer=null;
  if(id===null)return;
  onActiveChange(false);
  if(element.hasPointerCapture?.(id))element.releasePointerCapture(id);
 };
 const down=(event:PointerEvent)=>{
  if(event.defaultPrevented||event.target!==element||pointer!==null||!canDrag()||element.ownerDocument.visibilityState==='hidden')return;
  if(event.pointerType==='mouse'&&event.button!==0&&event.button!==2)return;
  if(!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))return;
  pointer=event.pointerId;previous={x:event.clientX,y:event.clientY};
  onActiveChange(true);
  element.setPointerCapture?.(event.pointerId);
  event.preventDefault();
 };
 const move=(event:PointerEvent)=>{
  if(pointer!==event.pointerId)return;
  if(!canDrag()||element.ownerDocument.visibilityState==='hidden'||(event.pointerType==='mouse'&&event.buttons===0)||!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY)){release();return;}
  const dx=event.clientX-previous.x,dy=event.clientY-previous.y;
  previous={x:event.clientX,y:event.clientY};
  onDelta(dx,dy);
  event.preventDefault();
 };
 const up=(event:PointerEvent)=>{if(pointer===event.pointerId)release();};
 const lost=(event:PointerEvent)=>{if(pointer===event.pointerId){pointer=null;onActiveChange(false);}};
 const visibility=()=>{if(element.ownerDocument.visibilityState==='hidden')release();};
 const context=(event:MouseEvent)=>event.preventDefault();
 element.addEventListener('pointerdown',down);
 element.addEventListener('pointermove',move);
 element.addEventListener('lostpointercapture',lost);
 element.addEventListener('contextmenu',context);
 // Window release is a fallback when capture is unavailable or interrupted.
 view.addEventListener('pointerup',up,true);
 view.addEventListener('pointercancel',up,true);
 view.addEventListener('blur',release);
 element.ownerDocument.addEventListener('visibilitychange',visibility);
 return ()=>{
  element.removeEventListener('pointerdown',down);
  element.removeEventListener('pointermove',move);
  element.removeEventListener('lostpointercapture',lost);
  element.removeEventListener('contextmenu',context);
  view.removeEventListener('pointerup',up,true);
  view.removeEventListener('pointercancel',up,true);
  view.removeEventListener('blur',release);
  element.ownerDocument.removeEventListener('visibilitychange',visibility);
  release();
 };
}
