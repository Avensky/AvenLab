import { useNetworkStore } from "../store/networkStore";
import { useVehicleConfigStore } from "../store/vehicleConfigStore";
import { useInputStore } from "../store/inputStore";
import { unpackCockpit } from "../store/tools/cockpitMasks";

// H-pattern is an input layout. Both layouts retain automatic forward shifts.
export function selectDriveGear(gear:number, override=true) {
  useInputStore.getState().setCockpit({automatic:true,gear},override&&gear>0&&gear<7?11:2);
}
export function stepManualGear(direction: 1 | -1): boolean {
  const network=useNetworkStore.getState(),me=network.getMe(),input=useInputStore.getState();
  const version=useVehicleConfigStore.getState().byPlayer[network.playerId]?.cockpitVersion??0;
  const age=performance.now()-(network.snapshot?.received_at_ms??-Infinity);
  if(!network.connected||!me||version<4||age<0||age>500)return false;
  const requested=unpackCockpit(input.input.cockpit_mask??me.cockpit_mask),confirmed=unpackCockpit(me.cockpit_mask);
  if(requested.gear>6)return false;
  const selected=requested.revision===confirmed.revision?Math.max(0,Math.min(6,me.gear)):requested.gear;
  const next=Math.max(0,Math.min(6,selected+direction));
  if(next!==selected)selectDriveGear(next);
  return true;
}
