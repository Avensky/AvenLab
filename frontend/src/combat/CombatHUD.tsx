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
   if(me?.health?.defeated){
    clearTankFireInputs(tankFireInputs);
    combatIntent.firePulseUntil=0;combatIntent.directWeaponHeld=null;combatIntent.ramPulseUntil=0;
    combatIntent.fire=false;combatIntent.keyboardFire=false;combatIntent.gamepadFire=false;
    combatIntent.ram=false;combatIntent.gamepadRam=false;combatIntent.keyboardRam=false;
    useCombatStore.getState().setScope(false);
   }
   const key=network.connected&&me?`${network.playerId}:${me.vehicle_id}`:'';
   if(key===autoVehicle)return;
   const wasTank=autoVehicle.endsWith(':tank');autoVehicle=key;
   if(me&&network.connected)useCombatStore.getState().setOrientationLocked(true);
   if(me?.vehicle_id==='tank'&&network.connected){useCombatStore.getState().selectWeapon('cannon');setTurretEnabled(true);}
   else if(wasTank||!network.connected)useCombatStore.getState().setEnabled(false);
  };
  // A fresh tank spawn must re-enable controls even if the previous tank was stopped.
  const entered=(event:Event)=>{const detail=(event as CustomEvent<{vehicle?:string}>).detail;if(detail?.vehicle==='tank'){autoVehicle='';setTurretEnabled(true);auto();}};
  auto();const unsubscribe=useNetworkStore.subscribe(auto);
  window.addEventListener('avenlab:vehicle-entered',entered);
  const stop=()=>{clearTankFireInputs(tankFireInputs);combatIntent.firePulseUntil=0;combatIntent.directWeaponHeld=null;combatIntent.ramPulseUntil=0;useCombatStore.getState().setScope(false);combatIntent.fire=false;combatIntent.keyboardFire=false;combatIntent.gamepadFire=false;combatIntent.ram=false;combatIntent.gamepadRam=false;combatIntent.keyboardRam=false;};
  window.addEventListener('blur',stop);document.addEventListener('visibilitychange',stop);
  const canRelease=useCanDataStore.subscribe(state=>{if(state.commandOpen)stop();});
  const uiRelease=useUIStore.subscribe(()=>{const ui=useUIStore.getState();if(ui.screen!=='sandbox'||ui.overlay!==null||ui.isModeLoading)stop();});
  return()=>{unsubscribe();uiRelease();canRelease();stop();window.removeEventListener('avenlab:vehicle-entered',entered);window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',stop);if(useUIStore.getState().screen!=='sandbox'){autoVehicle='';useCombatStore.getState().setEnabled(false);}};
 },[]);
 return <><TankScopeHUD/><ReviveActionFallback/><GuardBoostFallback/></>;
}
