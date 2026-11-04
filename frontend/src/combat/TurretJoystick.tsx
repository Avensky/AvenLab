import {TurretLockButton} from './TurretLockButton';
import {TurretResetButton} from './TurretResetButton';
import {VehicleAbilityActions} from './VehicleAbilityActions';
import {useCallback,useEffect,useRef,type PointerEvent} from 'react';
import {aimCombat,useCombatStore} from './combatStore';
import {canAimTurret} from './turretControls';
import './turretControls.css';
/** Dedicated pointer owner: releasing aim cannot release steering or the fire button. */
export function TurretJoystick({showActions=true}:{showActions?:boolean}={}){
 const enabled=useCombatStore(s=>s.enabled),root=useRef<HTMLDivElement>(null),pointer=useRef<number|null>(null),axis=useRef({x:0,y:0});
 const frame=useRef<number|null>(null),last=useRef(0);
 const release=useCallback(()=>{
  if(frame.current!==null)cancelAnimationFrame(frame.current);
  frame.current=null;pointer.current=null;axis.current={x:0,y:0};
  root.current?.style.setProperty('--aim-x','0px');root.current?.style.setProperty('--aim-y','0px');
  root.current?.setAttribute('aria-valuenow','0');
 },[]);
 const start=()=>{
  if(frame.current!==null || !(axis.current.x||axis.current.y))return;
  last.current=performance.now();
  const tick=(now:number)=>{
   frame.current=null;
   if(!canAimTurret()||!document.hasFocus()||document.visibilityState==='hidden'){release();return;}
   if(pointer.current===null||!(axis.current.x||axis.current.y))return;
   const dt=Math.max(0,Math.min((now-last.current)/1000,.05));last.current=now;
   aimCombat(axis.current.x*dt*1.8,axis.current.y*dt*1.2);
   frame.current=requestAnimationFrame(tick);
  };
  frame.current=requestAnimationFrame(tick);
 };
 useEffect(()=>{
  if(!enabled)return;
  window.addEventListener('blur',release);document.addEventListener('visibilitychange',release);
  return()=>{window.removeEventListener('blur',release);document.removeEventListener('visibilitychange',release);release();};
 },[enabled,release]);
 if(!enabled)return null;
 const move=(e:PointerEvent<HTMLDivElement>)=>{if(pointer.current!==e.pointerId)return;const b=e.currentTarget.getBoundingClientRect(),r=b.width*.35;let x=(e.clientX-b.left-b.width/2)/r,y=(e.clientY-b.top-b.height/2)/r;const length=Math.max(1,Math.hypot(x,y));x/=length;y/=length;axis.current={x:Math.abs(x)<.1?0:x,y:Math.abs(y)<.1?0:y};e.currentTarget.style.setProperty('--aim-x',`${x*r}px`);e.currentTarget.style.setProperty('--aim-y',`${y*r}px`);e.currentTarget.setAttribute('aria-valuenow',String(Math.round(x*100)));start();};
 const end=(e:PointerEvent<HTMLDivElement>)=>{if(pointer.current===e.pointerId)release();};
 return <div className="turret-touch-controls" aria-label="Turret controls"><div className="turret-orbit"><div className="turret-aim-module"><div ref={root} className="turret-joystick" role="slider" tabIndex={0} aria-label="Turret aim joystick" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={0} onContextMenu={e=>e.preventDefault()} onPointerDown={e=>{if(!canAimTurret()||pointer.current!==null||e.button!==0)return;e.preventDefault();e.stopPropagation();pointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);move(e);}} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={e=>{if(!canAimTurret())return;const d:{[key:string]:[number,number]}={ArrowLeft:[-.06,0],ArrowRight:[.06,0],ArrowUp:[0,-.04],ArrowDown:[0,.04]};if(d[e.key]){e.preventDefault();e.stopPropagation();aimCombat(...d[e.key]);}}}><span className="turret-stick-knob">+</span><small>AIM</small></div><div className="turret-rim-lock"><TurretLockButton/></div><div className="turret-rim-reset"><TurretResetButton/></div></div>{showActions&&<VehicleAbilityActions/>}</div></div>;
}

// Compatibility export for editor/cockpit callers; the component is vehicle-neutral.
export const VehicleAimControls=TurretJoystick;
