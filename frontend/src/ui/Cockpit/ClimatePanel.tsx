import { useInputStore } from "../../store/inputStore";
import { VehicleFlags,hasFlag } from "../../store/tools/inputMasks";
import { useCockpitState } from "./useCockpitState";
import { CabinClock,MatchClock } from "./CabinClock";

export function ClimatePanel() {
  const {cabin,confirmedCabin,extended,cabinMask,cabinPending}=useCockpitState();
  const flags=useInputStore(s=>s.input.vehicleMask),set=useInputStore.getState().setCabin;
  const change=(patch:Parameters<typeof set>[0])=>set(patch,cabinMask??undefined);
  return <section className="climate-panel" aria-label="Cabin controls" data-pending={cabinPending}>
    <div className="console-clock-strip"><CabinClock/><MatchClock/><button type="button" className="physical-hazard" aria-label="Hazards" aria-pressed={hasFlag(flags,VehicleFlags.HAZARDS)} onClick={()=>useInputStore.getState().toggleVehicleFlag(VehicleFlags.HAZARDS)}>△</button></div>
    <div className="climate-controls">
      <div className="climate-temperature"><button type="button" disabled={!extended} aria-label="Cabin temperature down" onClick={()=>change({temperatureC:cabin.temperatureC-1})}>−</button><output aria-label="Cabin temperature setting">{cabin.temperatureC}°</output><button type="button" disabled={!extended} aria-label="Cabin temperature up" onClick={()=>change({temperatureC:cabin.temperatureC+1})}>+</button></div>
      <button type="button" className="climate-fan" disabled={!extended} aria-label="Cabin fan speed" onClick={()=>change({fan:(cabin.fan+1)%4})}>FAN <b>{cabin.fan===0?'OFF':cabin.fan}</b></button>
      <button type="button" disabled={!extended} aria-label="Air conditioning" aria-pressed={confirmedCabin.ac} onClick={()=>change({ac:!cabin.ac})}>A/C</button>
      <button type="button" disabled={!extended} aria-label="Cabin recirculation" aria-pressed={confirmedCabin.recirculate} onClick={()=>change({recirculate:!cabin.recirculate})}>↻</button>
      <button type="button" disabled={!extended} aria-label="Front defroster" aria-pressed={confirmedCabin.frontDefrost} onClick={()=>change({frontDefrost:!cabin.frontDefrost})}>FRONT</button>
      <button type="button" disabled={!extended} aria-label="Rear defroster" aria-pressed={confirmedCabin.rearDefrost} onClick={()=>change({rearDefrost:!cabin.rearDefrost})}>REAR</button>
    </div>
  </section>;
}
