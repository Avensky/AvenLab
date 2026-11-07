import {create} from 'zustand';
import {isDrivingScreen,useUIStore} from '../store/menus/uiStore';
import {useMotionView} from '../store/session/networkViews';
import {HUD_STALE_MS} from '../store/telemetry/vehicleTelemetryStore';

export type FeedbackSignal='live'|'stale'|'offline'|'waiting'|'hidden';
export const useVehicleFeedbackFreshness=create<{signal:FeedbackSignal}>(()=>({signal:'hidden'}));
let owners=0,expiry:ReturnType<typeof setTimeout>|undefined,cleanup:(()=>void)|undefined;

/** Notifications and recovery icons need only freshness, not a full instrument
 * projection at 20 Hz. One shared deadline self-rechecks the latest receipt;
 * ordinary packets do not allocate timers or publish React state. */
function sample(){
  const network=useMotionView.getState(),ui=useUIStore.getState(),now=performance.now();
  const me=network.connected?network.getMe():undefined,received=network.snapshot?.received_at_ms;
  const active=document.visibilityState!=='hidden'&&isDrivingScreen(ui.screen)&&ui.overlay===null&&!ui.isModeLoading;
  const bound=!!me&&me.id===network.playerId&&(network.room_id===null||me.room_id===network.room_id);
  const signal:FeedbackSignal=!active?'hidden':!network.connected?'offline':!bound?'waiting':
    typeof received==='number'&&Number.isFinite(received)&&now>=received&&now-received<=HUD_STALE_MS?'live':'stale';
  if(signal!==useVehicleFeedbackFreshness.getState().signal)useVehicleFeedbackFreshness.setState({signal});
  if(signal!=='live'){
    clearTimeout(expiry);expiry=undefined;return;
  }
  if(expiry===undefined)expiry=setTimeout(()=>{
    expiry=undefined;sample();
  },Math.max(1,Math.ceil(received!+HUD_STALE_MS+1-now)));
}

export function startVehicleFeedbackFreshness(){
  if(++owners===1){
    const stopMotion=useMotionView.subscribe(sample),stopUI=useUIStore.subscribe(sample);
    document.addEventListener('visibilitychange',sample);sample();
    cleanup=()=>{stopMotion();stopUI();document.removeEventListener('visibilitychange',sample);};
  }
  let stopped=false;
  return()=>{
    if(stopped)return;stopped=true;
    if(--owners!==0)return;
    cleanup?.();cleanup=undefined;clearTimeout(expiry);expiry=undefined;
    if(useVehicleFeedbackFreshness.getState().signal!=='hidden')useVehicleFeedbackFreshness.setState({signal:'hidden'});
  };
}
