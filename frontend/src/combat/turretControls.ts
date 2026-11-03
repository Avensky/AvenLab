import {Quaternion,Vector3} from 'three';
import {canDrive} from "../controls/inputRouting";
import {useTextKeyboardStore} from "../store/text/keyboardStore";
import {useUIStore} from '../store/menus/uiStore';
import {useNetworkStore} from '../store/session/networkStore';
import {combatIntent,useCombatStore} from './combatStore';
export function canAimTurret(){const ui=useUIStore.getState();return canDrive() || (ui.screen==='sandbox'&&!ui.isModeLoading&&!useTextKeyboardStore.getState().session&&ui.overlay==='cockpit'&&ui.cockpitTab==='turret');}
export function setTurretEnabled(enabled:boolean){
  if(enabled){relative.set(0,0,1);const q=useNetworkStore.getState().getMe()?.rotation;if(q){const yaw=Math.atan2(2*(q[3]*q[1]+q[0]*q[2]),1-2*(q[1]*q[1]+q[0]*q[0]))+Math.PI;combatIntent.yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));}combatIntent.pitch=0;}
  useCombatStore.getState().setEnabled(enabled);
}

/** Only the tracked tank currently has multiple live weapons. */
export function cycleTankWeapon(direction=1){
  if(!combatIntent.enabled || !canDrive() || useNetworkStore.getState().getMe()?.vehicle_id!=='tank')return false;
  const slots=['cannon','coax'] as const;
  const index=slots.indexOf(combatIntent.weapon);
  useCombatStore.getState().selectWeapon(slots[(index+direction%slots.length+slots.length)%slots.length]);
  return true;
}

/** Capture the current relative pose; the server holds both axes authoritatively. */
const relative=new Vector3(0,0,1);
export function syncTurretOrientation(rotation:readonly number[]|undefined){
 if(!combatIntent.enabled||!combatIntent.orientationLocked||!rotation||rotation.length!==4||!rotation.every(Number.isFinite))return;
 const network=useNetworkStore.getState().getMe();
 if(network?.combat?.hull_locked&&network.combat.lock_yaw!==undefined){
  const yaw=network.combat.lock_yaw,pitch=network.combat.lock_pitch??0;
  relative.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
 }
 const direction=relative.clone().applyQuaternion(new Quaternion(...rotation).normalize());
 combatIntent.yaw=Math.atan2(-direction.x,-direction.z);combatIntent.pitch=Math.asin(Math.max(-1,Math.min(1,direction.y)));
}
export function toggleTurretOrientationLock(){
 if(!combatIntent.enabled||!canAimTurret()||useCombatStore.getState().scope)return false;
 if(!combatIntent.orientationLocked){
  const me=useNetworkStore.getState().getMe(),c=me?.combat;
  const yaw=c?.yaw??combatIntent.yaw,pitch=c?.pitch??combatIntent.pitch;
  relative.set(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
  if(me)relative.applyQuaternion(new Quaternion(...me.rotation).invert());
 }
 useCombatStore.getState().setOrientationLocked(!combatIntent.orientationLocked);return true;
}
export function resetTurretOrientation(){
 if(!combatIntent.enabled||!canAimTurret())return false;
 const q=useNetworkStore.getState().getMe()?.rotation;if(!q)return false;
 const direction=new Vector3(0,0,1).applyQuaternion(new Quaternion(...q));
 useCombatStore.getState().setOrientationLocked(false);
 combatIntent.yaw=Math.atan2(-direction.x,-direction.z);combatIntent.pitch=Math.asin(Math.max(-1,Math.min(1,direction.y)));return true;
}
export function toggleTankScope(){
 if(!canDrive()||!combatIntent.enabled||useNetworkStore.getState().getMe()?.vehicle_id!=='tank')return false;
 const store=useCombatStore.getState();store.setScope(!store.scope);return true;
}
export function triggerRam(){
 if(!canDrive()||useNetworkStore.getState().getMe()?.vehicle_id!=='tank'||!combatIntent.enabled)return false;
 combatIntent.ramPulseUntil=performance.now()+220;return true;
}
