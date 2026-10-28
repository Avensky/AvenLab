import { useEffect } from "react";
import { GearSelector,HandbrakeLever } from "./MechanicalControls";
import { DriveAssists } from "./DriveAssists";
import { useCockpitState } from "./useCockpitState";
import { useInputStore } from "../../store/inputStore";

export function DriveControls({compact=false,initializeManual=false}:{compact?:boolean;initializeManual?:boolean}) {
  const state=useCockpitState();
  useEffect(()=>{
    if(initializeManual&&state.extended&&useInputStore.getState().input.cockpit_mask===undefined)
      useInputStore.getState().setCockpit({automatic:false,gear:Math.max(1,Math.min(6,state.actualGear??1)),parking:false},2);
  },[initializeManual,state.extended,state.actualGear]);
  return <div className="transmission-console" data-compact={compact}>
    <HandbrakeLever strength={state.current.parkingStrength} disabled={!state.supported} pending={state.pending}/>
    <GearSelector automatic={state.current.automatic} gear={state.current.gear} actualGear={state.actualGear} disabled={!state.supported} pending={state.pending}/>
    <DriveAssists compact={compact}/>
  </div>;
}
