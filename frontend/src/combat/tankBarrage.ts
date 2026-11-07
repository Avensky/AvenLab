import type { MotionState } from "../store/session/networkViews";
import {announceCombat,captureNoticeEvent} from "./combatNoticeStore";
import { canDrive } from '../controls/inputRouting';
import { requestSocial } from '../net/socialClient';
import { useNetworkStore } from '../store/session/networkStore';

export function barrageReady(state:MotionState){
  const me=state.getMe(),match=state.snapshot?.match_state;
  return Boolean(state.connected && me?.vehicle_id && me.ultimate_fraction===1 && !me.barrage &&
    !me.health?.defeated && (!match || match.phase==='running'));
}
let pending=false;
export async function requestTankBarrage(){
  if(pending || !canDrive() || !barrageReady(useNetworkStore.getState()))return false;
  const notice=captureNoticeEvent();
  pending=true;
  try { await requestSocial('tank_barrage');if(notice)announceCombat('BARRAGE ACTIVE · 5 S','buff',notice);return true; }
  catch(error){if(notice)announceCombat(error instanceof Error?error.message:'Barrage unavailable','warning',notice);return false;}
  finally {pending=false;}
}
