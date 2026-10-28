import { GearSelector,HandbrakeLever } from "./MechanicalControls";
import { DriveAssists } from "./DriveAssists";
import { useCockpitState } from "./useCockpitState";
import { usePreferencesStore } from "../../store/preferencesStore";
import { cockpitCommandPending } from "../../store/tools/cockpitMasks";
import { useInputStore } from "../../store/inputStore";
import { useVehicleTelemetryStore } from "../../store/vehicleTelemetryStore";

export function DriveGearControl() {
  const state=useCockpitState(),automatic=usePreferencesStore(s=>s.shiftLayout==='automatic');
  const request=useInputStore(s=>s.input.cockpit_mask),confirmed=useVehicleTelemetryStore(s=>s.data.cockpitMask);
  const pending=cockpitCommandPending(request,confirmed,2,11),selector=pending?state.current.gear:state.confirmed.gear;
  const selected=pending||selector===0||selector>=7?selector:state.actualGear===-1?7:state.actualGear??selector;
  return <GearSelector automatic={automatic} gear={selected} disabled={!state.drivetrain} pending={pending}/>;
}
export function ParkingBrakeControl() {
  const state=useCockpitState();
  const request=useInputStore(s=>s.input.cockpit_mask),confirmed=useVehicleTelemetryStore(s=>s.data.cockpitMask);
  return <HandbrakeLever strength={state.current.parkingStrength} disabled={!state.supported} pending={cockpitCommandPending(request,confirmed,3)}/>;
}
export function DriveControls({compact=false}:{compact?:boolean}) {
  return <div className="transmission-console" data-compact={compact}><ParkingBrakeControl/><DriveGearControl/><DriveAssists compact={compact}/></div>;
}
