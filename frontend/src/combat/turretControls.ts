import {announceRadioEquipment} from '../store/radio/radioStore';
import {isMechanicPlayer} from './reviveTargets';
import {requestAssistedHealPack} from './healPackTargets';
import {TANK_SECONDARIES,secondaryDefinition,clearTankFireInputs,type TankFireSource,type TankFireSlot} from './tankLoadout';
import {Quaternion,Vector3} from 'three';
import {canDrive} from "../controls/inputRouting";
import {useTextKeyboardStore} from "../store/text/keyboardStore";
import {useUIStore} from '../store/menus/uiStore';
import {useNetworkStore} from '../store/session/networkStore';
import {combatIntent,confirmedLocalAim,tankFireInputs,useCombatStore,TURRET_RESET_COOLDOWN_MS,TURRET_LOCK_COOLDOWN_MS,type TankWeapon} from './combatStore';
export function canAimTurret(){if(useNetworkStore.getState().getMe()?.health?.defeated||useNetworkStore.getState().snapshot?.match_state?.phase==='ended')return false;const ui=useUIStore.getState();return canDrive() || (ui.screen==='sandbox'&&!ui.isModeLoading&&!useTextKeyboardStore.getState().session&&ui.overlay==='cockpit'&&ui.cockpitTab==='turret');}
export function setTurretEnabled(enabled:boolean){
  if(enabled){combatIntent.scopeRelockPending=false;relative.set(0,0,1);const q=useNetworkStore.getState().getMe()?.rotation;if(q){const yaw=Math.atan2(2*(q[3]*q[1]+q[0]*q[2]),1-2*(q[1]*q[1]+q[0]*q[0]))+Math.PI;combatIntent.yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));}combatIntent.pitch=0;}
  useCombatStore.getState().setEnabled(enabled);
}

/** Secondary cycling never replaces the cannon or maps planned hardware to fire. */
export function cycleTankWeapon(direction=1){
  if(!combatIntent.enabled || !canDrive() || useNetworkStore.getState().getMe()?.vehicle_id!=='tank')return false;
  const slots=TANK_SECONDARIES;
  const index=slots.findIndex(item=>item.id===useCombatStore.getState().secondaryWeapon);
  const next=slots[(index+direction%slots.length+slots.length)%slots.length];
  useCombatStore.getState().selectSecondary(next.id);
  announceRadioEquipment(`${next.label} · ${next.rangeMeters} m`);
  return true;
}

/** Capture the current relative pose; the server holds both axes authoritatively. */
const relative=new Vector3(0,0,1), aimDirection=new Vector3(), hullRotation=new Quaternion();
export function syncTurretOrientation(rotation:readonly number[]|undefined,now=performance.now()){
 if(combatIntent.resetRelockAt>0&&combatIntent.enabled&&rotation?.length===4&&rotation.every(Number.isFinite)){
  const direction=aimDirection.set(0,0,1).applyQuaternion(hullRotation.fromArray(rotation).normalize());
  combatIntent.yaw=Math.atan2(-direction.x,-direction.z);combatIntent.pitch=Math.asin(Math.max(-1,Math.min(1,direction.y)));
  const confirmed=useNetworkStore.getState().getMe()?.combat;
  // The server slews at a bounded rate. Wait for its forward pose instead of
  // freezing a half-finished turn when the one-second button refill ends.
  const yawError=confirmed?Math.abs(Math.atan2(Math.sin(confirmed.yaw-combatIntent.yaw),Math.cos(confirmed.yaw-combatIntent.yaw))):Infinity;
  if(now>=combatIntent.resetRelockAt&&confirmed?.hull_locked!==true&&yawError<.04&&Math.abs((confirmed?.pitch??Infinity)-combatIntent.pitch)<.03){
   relative.set(0,0,1);useCombatStore.getState().setOrientationLocked(true);
  }else return;
 }

 if(!combatIntent.enabled||!combatIntent.orientationLocked||!rotation||rotation.length!==4||!rotation.every(Number.isFinite))return;
 const network=useNetworkStore.getState().getMe();
 if(combatIntent.scopeRelockPending){
  combatIntent.lock_target??=confirmedLocalAim();
  combatIntent.scopeRelockPending=false;
 }
 const confirmed=network?.combat;
 const yaw=combatIntent.lock_target?.[0]??(confirmed?.hull_locked?confirmed.lock_yaw:undefined);
 if(yaw!==undefined){
  const pitch=combatIntent.lock_target?.[1]??confirmed?.lock_pitch??0;
  relative.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
 }
 const direction=aimDirection.copy(relative).applyQuaternion(hullRotation.fromArray(rotation).normalize());
 combatIntent.yaw=Math.atan2(-direction.x,-direction.z);combatIntent.pitch=Math.asin(Math.max(-1,Math.min(1,direction.y)));
}
export function toggleTurretOrientationLock(){
 const now=performance.now();
 if(!combatIntent.enabled||!canAimTurret()||useCombatStore.getState().scope||now<useCombatStore.getState().turretLockReadyAt)return false;
 const lock=!combatIntent.orientationLocked;
 const captured=lock?confirmedLocalAim():undefined;
 useCombatStore.setState({turretLockReadyAt:now+TURRET_LOCK_COOLDOWN_MS});
 useCombatStore.getState().setOrientationLocked(lock);
 combatIntent.lock_target=captured;
 return true;
}
export function resetTurretOrientation(){
 const now=performance.now();
 if(!combatIntent.enabled||!canAimTurret()||now<useCombatStore.getState().turretResetReadyAt)return false;
 const q=useNetworkStore.getState().getMe()?.rotation;if(!q)return false;
 const direction=new Vector3(0,0,1).applyQuaternion(new Quaternion(...q));
 const restoreLock=combatIntent.orientationLocked;
 useCombatStore.setState({turretResetReadyAt:now+TURRET_RESET_COOLDOWN_MS});
 useCombatStore.getState().setOrientationLocked(false);
 combatIntent.resetRelockAt=restoreLock?now+TURRET_RESET_COOLDOWN_MS:0;
 combatIntent.yaw=Math.atan2(-direction.x,-direction.z);combatIntent.pitch=Math.asin(Math.max(-1,Math.min(1,direction.y)));return true;
}
export function toggleTankScope(){
 if(!canDrive()||!combatIntent.enabled||!useNetworkStore.getState().getMe()?.vehicle_id)return false;
 const store=useCombatStore.getState();store.setScope(!store.scope);return true;
}
export function triggerRam(){
 if(!canDrive()||useNetworkStore.getState().getMe()?.vehicle_id!=='tank'||!combatIntent.enabled)return false;
 combatIntent.ramPulseUntil=performance.now()+220;return true;
}

/** A short click survives the interval between input packets; Rust still owns
 * reload and fire cadence. Holding a weapon face keeps that weapon firing. */
export function requestWeaponFire(weapon?:TankWeapon){
 if(isMechanicPlayer()){if(!canDrive())return false;void requestAssistedHealPack();return true;}
 if(!canDrive()||!combatIntent.enabled)return false;
 if(useNetworkStore.getState().getMe()?.vehicle_id==='tank')return weapon&&weapon!=='cannon'?requestSecondaryFire():requestPrimaryFire();
 if(weapon)useCombatStore.getState().selectWeapon(weapon);
 combatIntent.firePulseUntil=performance.now()+120;return true;
}

function requestSlotFire(slot:TankFireSlot,source:TankFireSource='pointer'){
 if(!canDrive()||!combatIntent.enabled||useNetworkStore.getState().getMe()?.vehicle_id!=='tank')return false;
 if(slot==='secondary'&&secondaryDefinition(useCombatStore.getState().secondaryWeapon).planned){
  announceRadioEquipment('SECONDARY MOUNT UNAVAILABLE');return false;
 }
 tankFireInputs[source][slot==='primary'?'primaryPulseUntil':'secondaryPulseUntil']=performance.now()+120;
 return true;
}
export function requestPrimaryFire(){return requestSlotFire('primary');}
export function requestSecondaryFire(){return requestSlotFire('secondary');}
/** Each device/slot owns its hold. Releasing one cannot cancel another device. */
export function setWeaponHeld(source:TankFireSource,slot:TankFireSlot,held:boolean){
 if(!held){tankFireInputs[source][slot]=false;return true;}
 if(!canDrive()||!combatIntent.enabled||useNetworkStore.getState().getMe()?.vehicle_id!=='tank')return false;
 if(tankFireInputs[source][slot])return slot!=='secondary'||!secondaryDefinition(useCombatStore.getState().secondaryWeapon).planned;
 tankFireInputs[source][slot]=true;
 return requestSlotFire(slot,source);
}
export function releaseWeaponSource(source:TankFireSource){clearTankFireInputs(tankFireInputs,source);}
