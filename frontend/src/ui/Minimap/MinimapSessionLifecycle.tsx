import {useEffect} from 'react';
import {useUIStore} from '../../store/menus/uiStore';
import {useNetworkStore} from '../../store/session/networkStore';
import {useHudPanelsStore} from '../../store/hud/hudPanelsStore';

/** A layout preference is opened once for deployment and the real round start.
 * Later snapshots or closing a menu never undo the player's collapse choice. */
export function MinimapSessionLifecycle(){
 useEffect(()=>{
  const sync=()=>{
   const ui=useUIStore.getState(),network=useNetworkStore.getState(),me=network.getMe(),match=network.snapshot?.match_state;
   const deployed=ui.screen==='sandbox'&&!ui.isModeLoading&&network.connected&&me&&me.room_id===(network.room_id??me.room_id);
   const key=deployed&&match?.phase!=='ended'?`${network.playerId}:${me.room_id}:${match?.match_id??'practice'}:${match?.phase==='running'?'round':'world'}`:null;
   useHudPanelsStore.getState().openMapForSession(key);
  };
  sync();const network=useNetworkStore.subscribe(sync),ui=useUIStore.subscribe(sync);
  return()=>{network();ui();};
 },[]);
 return null;
}
