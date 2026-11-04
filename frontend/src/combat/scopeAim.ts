import {bindCameraDrag} from '../utils/cameraDrag';
import {useUIStore} from '../store/menus/uiStore';
import {useNetworkStore} from '../store/session/networkStore';
import {aimCombat,useCombatStore} from './combatStore';
import {canAimTurret} from './turretControls';

/** CSS-pixel drag gain before the existing independent turret sensitivities.
 * Higher magnification reduces angular travel for precise long-range aiming. */
export const SCOPE_DRAG_RADIANS_PER_PIXEL=.004;
export function scopeDragDelta(dx:number,dy:number,zoom:number):[number,number]|null{
 if(!Number.isFinite(dx)||!Number.isFinite(dy)||(zoom!==2&&zoom!==4))return null;
 const gain=SCOPE_DRAG_RADIANS_PER_PIXEL/zoom;
 return [dx*gain,dy*gain];
}

/** This is a separate owner from chase-camera drag. It moves the actual turret
 * target, so the scoped camera follows the authoritative aiming pose. */
export function bindScopedAimDrag(canvas:HTMLCanvasElement){
 return bindCameraDrag(canvas,{
  canDrag:()=>{
   const ui=useUIStore.getState(),combat=useCombatStore.getState(),network=useNetworkStore.getState();
   return network.connected&&!!network.getMe()?.vehicle_id&&combat.enabled&&combat.scope&&ui.screen==='sandbox'&&ui.overlay===null&&!ui.isModeLoading&&canAimTurret();
  },
  onActiveChange:()=>{},
  onDelta:(dx,dy)=>{
   const delta=scopeDragDelta(dx,dy,useCombatStore.getState().scopeZoom);
   if(delta)aimCombat(...delta);
  },
 });
}
