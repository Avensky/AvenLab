import { useInputStore } from "../store/inputStore";
import { VehicleFlags, PlayerFlags, hasFlag } from "../store/tools/inputMasks";
import { ActionButton, HoldButton } from "../controls/TouchControls";

export default function ControlsPanel() {
  const vehicle = useInputStore(s => s.input.vehicleMask), player = useInputStore(s => s.input.playerMask);
  const store = useInputStore.getState();
  const toggle = (label: string, icon: string, active: boolean, action: () => void) => <ActionButton aria-label={label} aria-pressed={active} title={label} onClick={action}><img src={`/images/${icon}.svg`} alt="" draggable={false} /></ActionButton>;
  return <div className="vehicle-actions" role="group" aria-label="Vehicle controls">
    <HoldButton aria-label="Reset vehicle" title="Reset vehicle" aria-pressed={hasFlag(player, PlayerFlags.RESET)} onHold={held => store.setHeldPlayerFlag("touch-actions", PlayerFlags.RESET, held)}><img src="/images/reset.svg" alt="" /></HoldButton>
    {toggle("Radio", hasFlag(player, PlayerFlags.RADIO) ? "soundOn" : "soundOff", hasFlag(player, PlayerFlags.RADIO), () => store.togglePlayerFlag(PlayerFlags.RADIO))}
    {toggle("Headlights", "headlights", hasFlag(vehicle, VehicleFlags.HEADLIGHTS), () => store.toggleVehicleFlag(VehicleFlags.HEADLIGHTS))}
    {toggle("Left indicator", "left", hasFlag(vehicle, VehicleFlags.BLINKER_LEFT), () => store.toggleVehicleFlag(VehicleFlags.BLINKER_LEFT))}
    {toggle("Hazards", "hazzard", hasFlag(vehicle, VehicleFlags.HAZARDS), () => store.toggleVehicleFlag(VehicleFlags.HAZARDS))}
    {toggle("Right indicator", "right", hasFlag(vehicle, VehicleFlags.BLINKER_RIGHT), () => store.toggleVehicleFlag(VehicleFlags.BLINKER_RIGHT))}
    <HoldButton aria-label="Horn" title="Horn" aria-pressed={hasFlag(player, PlayerFlags.HONK)} onHold={held => store.setHeldPlayerFlag("touch-actions", PlayerFlags.HONK, held)}><img src="/images/hornCurve.svg" alt="" /></HoldButton>
    {toggle("Engine", "onOff", hasFlag(vehicle, VehicleFlags.ENGINE_ON), () => store.toggleVehicleFlag(VehicleFlags.ENGINE_ON))}
  </div>;
}
