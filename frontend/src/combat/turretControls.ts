import {canDrive} from "../controls/inputRouting";
import {useTextKeyboardStore} from "../store/text/keyboardStore";
import {useUIStore} from '../store/menus/uiStore';
import {useNetworkStore} from '../store/session/networkStore';
import {combatIntent,useCombatStore} from './combatStore';
export function canAimTurret(){const ui=useUIStore.getState();return canDrive() || (ui.screen==='sandbox'&&!ui.isModeLoading&&!useTextKeyboardStore.getState().session&&ui.overlay==='cockpit'&&ui.cockpitTab==='turret');}
export function setTurretEnabled(enabled:boolean){
  if(enabled){const q=useNetworkStore.getState().getMe()?.rotation;if(q){const yaw=Math.atan2(2*(q[3]*q[1]+q[0]*q[2]),1-2*(q[1]*q[1]+q[0]*q[0]))+Math.PI;combatIntent.yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));}combatIntent.pitch=0;}
  useCombatStore.getState().setEnabled(enabled);
}
