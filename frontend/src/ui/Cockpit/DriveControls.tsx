import { GearSelector,HandbrakeLever } from "./MechanicalControls";
import { DriveAssists } from "./DriveAssists";
import { useCockpitState } from "./useCockpitState";
import { usePreferencesStore } from "../../store/preferencesStore";

export function DriveGearControl() {
  const state=useCockpitState(),automatic=usePreferencesStore(s=>s.shiftLayout==='automatic');
  const selected=state.pending||state.current.gear===0||state.current.gear>=7?state.current.gear:state.actualGear===-1?7:state.actualGear??state.current.gear;
  return <GearSelector automatic={automatic} gear={selected} disabled={!state.drivetrain} pending={state.pending}/>;
}
export function ParkingBrakeControl() {
  const state=useCockpitState();
  return <HandbrakeLever strength={state.current.parkingStrength} disabled={!state.supported} pending={state.pending}/>;
}
export function DriveControls({compact=false}:{compact?:boolean}) {
  return <div className="transmission-console" data-compact={compact}><ParkingBrakeControl/><DriveGearControl/><DriveAssists compact={compact}/></div>;
}
