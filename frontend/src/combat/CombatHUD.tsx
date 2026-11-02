import {useUIStore} from "../store/menus/uiStore";
import {useNetworkStore} from "../store/session/networkStore";
import {useEffect} from 'react';
import {aimCombat,combatIntent,useCombatStore} from './combatStore';
import {canAimTurret} from './turretControls';
/** Input lifecycle only. No floating diagnostic panel over the instruments. */
export function CombatHUD(){
 const enabled=useCombatStore(s=>s.enabled);
 useEffect(()=>{const stop=()=>{combatIntent.fire=false;combatIntent.gamepadFire=false;};const move=(e:MouseEvent)=>{if(enabled&&canAimTurret()&&e.buttons===0&&e.target instanceof HTMLCanvasElement)aimCombat(e.movementX*.003,e.movementY*.003);};const unsubscribe=useNetworkStore.subscribe((next,previous)=>{if(previous.connected&&!next.connected)useCombatStore.getState().setEnabled(false);});window.addEventListener('mousemove',move);window.addEventListener('blur',stop);document.addEventListener('visibilitychange',stop);return()=>{unsubscribe();stop();if(useUIStore.getState().screen!=='sandbox')useCombatStore.getState().setEnabled(false);window.removeEventListener('mousemove',move);window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',stop);};},[enabled]);
 return null;
}
