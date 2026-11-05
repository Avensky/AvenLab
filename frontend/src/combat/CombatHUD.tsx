import { useMotionView } from "../store/session/networkViews";
import {ReviveActionFallback} from './ReviveAction';
import {GuardBoostFallback} from './GuardBoostAction';
import {useCanDataStore} from '../store/recon/canDataStore';
import {clearTankFireInputs} from './tankLoadout';
import {useUIStore} from '../store/menus/uiStore';
import {useNetworkStore} from '../store/session/networkStore';
import {useEffect} from 'react';
import {combatIntent,tankFireInputs,useCombatStore} from './combatStore';
import {TankScopeHUD} from './TankScope';
import {setTurretEnabled} from './turretControls';
let autoVehicle='';
/** Input lifecycle only. Canvas mouse/trackpad gestures belong to the camera. */
export function CombatHUD(){
 useEffect(()=>{
  const auto=()=>{
   const network=useNetworkStore.getState(),me=network.getMe();
   const live=network.connected && me?.vehicle_id && !me.health?.defeated;
   const key=live?`${network.playerId}:${me.room_id}:${me.vehicle_id}`:'';
   if(key===autoVehicle)return;
   autoVehicle=key;
   const controls=useCombatStore.getState();
   controls.setScope(false);
   if(live){
    controls.setOrientationLocked(true);
    if(me.vehicle_id==='tank')controls.selectWeapon('cannon');
   }
   setTurretEnabled(Boolean(live));
  };
  const entered=()=>{autoVehicle='';auto();};
  auto();const unsubscribe=useMotionView.subscribe(auto);
  window.addEventListener('avenlab:vehicle-entered',entered);
  const stop=()=>{clearTankFireInputs(tankFireInputs);combatIntent.firePulseUntil=0;combatIntent.directWeaponHeld=null;combatIntent.ramPulseUntil=0;useCombatStore.getState().setScope(false);combatIntent.fire=false;combatIntent.keyboardFire=false;combatIntent.gamepadFire=false;combatIntent.ram=false;combatIntent.gamepadRam=false;combatIntent.keyboardRam=false;};
  window.addEventListener('blur',stop);document.addEventListener('visibilitychange',stop);
  const canRelease=useCanDataStore.subscribe(state=>{if(state.commandOpen)stop();});
  const uiRelease=useUIStore.subscribe(()=>{const ui=useUIStore.getState();if(ui.screen!=='sandbox'||ui.overlay!==null||ui.isModeLoading)stop();});
  return()=>{unsubscribe();uiRelease();canRelease();stop();window.removeEventListener('avenlab:vehicle-entered',entered);window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',stop);if(useUIStore.getState().screen!=='sandbox'){autoVehicle='';useCombatStore.getState().setEnabled(false);}};
 },[]);
 return <><TankScopeHUD/><ReviveActionFallback/><GuardBoostFallback/></>;
}
