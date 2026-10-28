import { useNetworkStore } from "../store/networkStore";
import { useVehicleConfigStore } from "../store/vehicleConfigStore";
import { useInputStore } from "../store/inputStore";
import { unpackCockpit } from "../store/tools/cockpitMasks";

export function stepManualGear(direction: 1 | -1): boolean {
  const network=useNetworkStore.getState(),me=network.getMe(),input=useInputStore.getState();
  const version=useVehicleConfigStore.getState().byPlayer[network.playerId]?.cockpitVersion??0;
  if(!network.connected||!me||version<2||performance.now()-(network.snapshot?.received_at_ms??-Infinity)>500)return false;
  const requested=unpackCockpit(input.input.cockpit_mask??me.cockpit_mask),confirmed=unpackCockpit(me.cockpit_mask);
  if(requested.automatic||requested.gear>6)return false;
  const selected=requested.revision===confirmed.revision?Math.max(0,Math.min(6,me.gear)):requested.gear;
  const next=Math.max(0,Math.min(6,selected+direction));
  if(next!==selected)input.setCockpit({gear:next,parking:false},2);
  return true;
}
