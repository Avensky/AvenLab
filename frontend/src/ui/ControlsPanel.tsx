import { useInputStore } from "../store/inputStore";
import { useUIStore } from "../store/uiStore";
import { VehicleFlags, PlayerFlags, hasFlag } from "../store/tools/inputMasks";
import { ActionButton, HoldButton } from "../controls/TouchControls";
import { CabinClock } from "./Cockpit/CockpitPanel";

export default function ControlsPanel() {
  const vehicle=useInputStore(s=>s.input.vehicleMask),player=useInputStore(s=>s.input.playerMask);
  const store=useInputStore.getState();
  return <div className="vehicle-actions cockpit-launcher" role="group" aria-label="Vehicle controls">
    <div className="mini-console-header"><CabinClock/><ActionButton className="physical-hazard" aria-label="Hazards" aria-pressed={hasFlag(vehicle,VehicleFlags.HAZARDS)} onClick={()=>store.toggleVehicleFlag(VehicleFlags.HAZARDS)}>△</ActionButton></div>
    <div className="mini-console-controls">
      <ActionButton className="engine-switch" aria-label="Engine" aria-pressed={hasFlag(vehicle,VehicleFlags.ENGINE_ON)} onClick={()=>store.toggleVehicleFlag(VehicleFlags.ENGINE_ON)}><img src="/images/onOff.svg" alt=""/></ActionButton>
      <ActionButton aria-label="Open cockpit" title="Cockpit · F4" onClick={()=>useUIStore.getState().openCockpit()}><img src="/images/tv.svg" alt=""/></ActionButton>
      <ActionButton aria-label="Headlights" aria-pressed={hasFlag(vehicle,VehicleFlags.HEADLIGHTS)} onClick={()=>store.toggleVehicleFlag(VehicleFlags.HEADLIGHTS)}><img src="/images/headlights.svg" alt=""/></ActionButton>
      <ActionButton aria-label="Radio" onClick={()=>useUIStore.getState().openCockpit("radio")}><img src="/images/soundOn.svg" alt=""/></ActionButton>
      <HoldButton aria-label="Horn" aria-pressed={hasFlag(player,PlayerFlags.HONK)} onHold={held=>store.setHeldPlayerFlag("touch-actions",PlayerFlags.HONK,held)}><img src="/images/hornCurve.svg" alt=""/></HoldButton>
      <HoldButton aria-label="Reset vehicle" aria-pressed={hasFlag(player,PlayerFlags.RESET)} onHold={held=>store.setHeldPlayerFlag("touch-actions",PlayerFlags.RESET,held)}><img src="/images/reset.svg" alt=""/></HoldButton>
    </div>
  </div>;
}
