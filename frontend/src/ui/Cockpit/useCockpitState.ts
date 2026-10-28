import { useInputStore } from "../../store/inputStore";
import { useVehicleTelemetryStore } from "../../store/vehicleTelemetryStore";
import { cockpitStatus, unpackCockpit } from "../../store/tools/cockpitMasks";
import { unpackCabin } from "../../store/tools/cabinMasks";

export function useCockpitState() {
  const confirmedMask = useVehicleTelemetryStore(s=>s.data.cockpitMask);
  const cabinMask = useVehicleTelemetryStore(s=>s.data.cabinMask);
  const version = useVehicleTelemetryStore(s=>s.data.config.cockpitVersion);
  const live = useVehicleTelemetryStore(s=>s.data.signal==='live');
  const actualGear = useVehicleTelemetryStore(s=>s.data.gear);
  const tcs = useVehicleTelemetryStore(s=>s.data.tcsEnabled);
  const request = useInputStore(s=>s.input.cockpit_mask), cabinRequest = useInputStore(s=>s.input.cabin_mask);
  const confirmed = unpackCockpit(confirmedMask??undefined), requested = unpackCockpit(request??undefined);
  const pending = request!==undefined && (confirmedMask===null || requested.revision!==confirmed.revision);
  return {confirmed,current:pending?requested:confirmed,pending,actualGear,status:cockpitStatus(confirmedMask),
    supported:live&&version>=2,extended:live&&version>=3,drivetrain:live&&version>=4,climate:live&&version>=5,version,cabinMask,tcs,
    cabin:unpackCabin(cabinRequest??cabinMask??undefined),confirmedCabin:unpackCabin(cabinMask??undefined),
    cabinPending:cabinRequest!==undefined&&(cabinMask===null||(cabinRequest&0xf03ff)!==(cabinMask&0xf03ff))};
}
