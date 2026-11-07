import {useEffect} from 'react';
import {useThree} from '@react-three/fiber';
import {Vector3} from 'three';
import {useNetworkStore} from '../store/session/networkStore';
import {useUIStore} from '../store/menus/uiStore';
import {useGameStore} from '../store/presentation/gameStore';
import {inputRef} from '../store/input/inputStore';
import {useWorldStore} from '../store/world/worldStore';
import {useVehicleAudioSettings} from './vehicleAudioSettings';
import {peekVehicleAudio,unlockVehicleAudio} from './sharedAudio';
import {createVehicleAudioEngine} from './vehicleAudioEngine';
import {createVehicleSoundProjector,selectAudibleVehicles} from './vehicleSoundModel';
import {tunnelReverbAt} from './audioEnvironment';

export const VEHICLE_AUDIO_INTERVAL_MS=50;
export const VEHICLE_AUDIO_STALE_MS=400;

/** Mount once in VehicleScene. A 20 Hz imperative mixer keeps audio off both
 * React's render path and the high-frequency snapshot subscription graph. */
export function VehicleAudioScene(){
  const camera=useThree(state=>state.camera);
  useEffect(()=>{
    const audio=createVehicleAudioEngine(),position=new Vector3(),forward=new Vector3(),up=new Vector3();
    const projector=createVehicleSoundProjector(),retained=new Set<string>();
    let room:number|null=null,lastTick=0,timer:number|null=null;
    const silence=()=>{audio.silence();projector.clear();retained.clear();};
    const update=()=>{
      const net=useNetworkStore.getState(),settings=useVehicleAudioSettings.getState(),ui=useUIStore.getState();
      const snapshot=net.snapshot,now=performance.now(),received=snapshot?.received_at_ms;
      const fresh=net.connected&&snapshot&&typeof received==='number'&&Number.isFinite(received)&&now>=received&&now-received<=VEHICLE_AUDIO_STALE_MS;
      if(document.hidden||!fresh||!settings.enabled||settings.master<=0||!useGameStore.getState().sound||
         ui.screen!=='sandbox'||ui.overlay!==null||ui.isModeLoading||!peekVehicleAudio()){
        silence();lastTick=now;return;
      }
      if(net.room_id!==room){silence();room=net.room_id;}
      camera.getWorldPosition(position);camera.getWorldDirection(forward);up.set(0,1,0).applyQuaternion(camera.quaternion).normalize();
      const ear=position.toArray() as [number,number,number];
      const selected=selectAudibleVehicles(snapshot.entities,ear,net.playerId,settings.maxVoices,retained);
      retained.clear();
      const states=selected.map(({entity})=>{
        retained.add(entity.id);
        return projector.project(entity,received/1000,entity.id===net.playerId?inputRef.current:undefined);
      });
      projector.retain(retained);
      audio.update(states,{position:ear,forward:forward.toArray() as [number,number,number],up:up.toArray() as [number,number,number]},settings,
        (now-lastTick)/1000,tunnelReverbAt(useWorldStore.getState().map,ear));
      lastTick=now;
    };
    const unlock=(event:Event)=>{if(event.isTrusted&&useVehicleAudioSettings.getState().enabled)unlockVehicleAudio();};
    const start=()=>{if(timer===null&&!document.hidden)timer=window.setInterval(update,VEHICLE_AUDIO_INTERVAL_MS);};
    const visibility=()=>{
      if(document.hidden){if(timer!==null)window.clearInterval(timer);timer=null;silence();}
      else start();
    };
    window.addEventListener('pointerdown',unlock,{passive:true});window.addEventListener('keydown',unlock);
    document.addEventListener('visibilitychange',visibility);start();
    return()=>{
      if(timer!==null)window.clearInterval(timer);
      window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);
      document.removeEventListener('visibilitychange',visibility);audio.dispose();
    };
  },[camera]);
  return null;
}
