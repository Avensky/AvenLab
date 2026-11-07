import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import {DEFAULT_VEHICLE_AUDIO,sanitizeVehicleAudio,type VehicleAudioSettings} from './audioSettings.ts';
import {setVehicleAudioMaster} from './sharedAudio.ts';

export const useVehicleAudioSettings=create(persist<VehicleAudioSettings&{
  update:(patch:Partial<VehicleAudioSettings>)=>void;
}>((set)=>({
  ...DEFAULT_VEHICLE_AUDIO,
  update:patch=>set(state=>sanitizeVehicleAudio({...state,...patch})),
}),{
  name:'avenlab-vehicle-audio-v1',version:1,
  merge:(saved,current)=>({...current,...sanitizeVehicleAudio(saved)}),
}));
const applyMaster=()=>{
  const settings=useVehicleAudioSettings.getState();
  setVehicleAudioMaster(settings.enabled,settings.master);
};
applyMaster();
const unsubscribe=useVehicleAudioSettings.subscribe(applyMaster);
if(import.meta.hot)import.meta.hot.dispose(unsubscribe);
