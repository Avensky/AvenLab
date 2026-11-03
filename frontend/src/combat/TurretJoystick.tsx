import {RamAttack} from './RamAttack';
import {AttackIcon} from './AttackIcon';
import {CooldownDial} from './CooldownClock';
import {WeaponChoiceButton} from './WeaponChoiceButton';
import {useNetworkStore} from '../store/session/networkStore';
import {SelectedCooldownClock} from './CooldownClock';
import {TurretLockButton} from './TurretLockButton';
import {HoldButton} from "../controls/TouchControls";
import {canDrive} from "../controls/inputRouting";
import {useCallback,useEffect,useRef,type PointerEvent} from 'react';
import {aimCombat,combatIntent,useCombatStore} from './combatStore';
import {canAimTurret,resetTurretOrientation,toggleTankScope} from './turretControls';
import './turretControls.css';
/** Dedicated pointer owner: releasing aim cannot release steering or the fire button. */
export function TurretJoystick(){
 const tank=useNetworkStore(s=>s.getMe()?.vehicle_id==='tank');
 const scope=useCombatStore(s=>s.scope);
 const cooling=useNetworkStore(s=>(s.getMe()?.combat?.reload??0)>0);
 const enabled=useCombatStore(s=>s.enabled),root=useRef<HTMLDivElement>(null),pointer=useRef<number|null>(null),axis=useRef({x:0,y:0});
 const release=useCallback(()=>{pointer.current=null;axis.current={x:0,y:0};root.current?.style.setProperty('--aim-x','0px');root.current?.style.setProperty('--aim-y','0px');root.current?.setAttribute('aria-valuenow','0');},[]);
 useEffect(()=>{if(!enabled)return;let frame=0,last=performance.now();const tick=(now:number)=>{const dt=Math.min((now-last)/1000,.05);last=now;if(canAimTurret()&&document.hasFocus())aimCombat(axis.current.x*dt*1.8,axis.current.y*dt*1.2);else release();frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);window.addEventListener('blur',release);document.addEventListener('visibilitychange',release);return()=>{cancelAnimationFrame(frame);window.removeEventListener('blur',release);document.removeEventListener('visibilitychange',release);release();};},[enabled,release]);
 if(!enabled)return null;
 const move=(e:PointerEvent<HTMLDivElement>)=>{if(pointer.current!==e.pointerId)return;const b=e.currentTarget.getBoundingClientRect(),r=b.width*.35;let x=(e.clientX-b.left-b.width/2)/r,y=(e.clientY-b.top-b.height/2)/r;const length=Math.max(1,Math.hypot(x,y));x/=length;y/=length;axis.current={x:Math.abs(x)<.1?0:x,y:Math.abs(y)<.1?0:y};e.currentTarget.style.setProperty('--aim-x',`${x*r}px`);e.currentTarget.style.setProperty('--aim-y',`${y*r}px`);e.currentTarget.setAttribute('aria-valuenow',String(Math.round(x*100)));};
 return <div className="turret-touch-controls" aria-label="Turret controls"><div className="turret-orbit"><div ref={root} className="turret-joystick" role="slider" tabIndex={0} aria-label="Turret aim joystick" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={0} onContextMenu={e=>e.preventDefault()} onPointerDown={e=>{if(!canAimTurret()||pointer.current!==null||e.button!==0)return;e.preventDefault();e.stopPropagation();pointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);move(e);}} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onKeyDown={e=>{if(!canAimTurret())return;const d:{[key:string]:[number,number]}={ArrowLeft:[-.06,0],ArrowRight:[.06,0],ArrowUp:[0,-.04],ArrowDown:[0,.04]};if(d[e.key]){e.preventDefault();e.stopPropagation();aimCombat(...d[e.key]);}}}><span className="turret-stick-knob">+</span><small>AIM</small></div><div className="turret-actions"><div className="turret-orbit-fire"><HoldButton data-ready={!cooling} aria-label="FIRE" className="turret-fire" disabled={!canDrive()} onHold={held=>{combatIntent.fire=held;}}><SelectedCooldownClock><AttackIcon kind="fire"/></SelectedCooldownClock><span>FIRE</span></HoldButton></div>{tank&&<><div className="turret-orbit-primary"><WeaponChoiceButton weapon="cannon"/></div><div className="turret-orbit-secondary"><WeaponChoiceButton weapon="coax"/></div></>}<div className="turret-orbit-lock"><TurretLockButton/></div>{tank&&<><div className="turret-orbit-reset"><button type="button" className="turret-reset" aria-label="Reset turret forward" title="Reset forward · D-pad Up" onClick={resetTurretOrientation}><CooldownDial progress={1}><AttackIcon kind="reset"/></CooldownDial><span>RESET</span></button></div><div className="turret-orbit-scope"><button type="button" className="turret-scope" disabled={!canDrive()} aria-label="Tank scope" aria-pressed={scope} title="Scope · D-pad Down / editable keyboard binding" onClick={toggleTankScope}><CooldownDial progress={1}><AttackIcon kind="scope"/></CooldownDial><span>SCOPE</span></button></div></>}{tank&&<div className="turret-orbit-ram"><RamAttack/></div>}</div></div></div>;
}
