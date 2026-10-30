import { useInputStore } from "../../store/input/inputStore";
import { cockpitCommandPending } from "../../store/input/protocol/cockpitMasks";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { useVehicleTelemetryStore } from "../../store/telemetry/vehicleTelemetryStore";
import { DriveAssists } from "./DriveAssists";
import { GearSelector, HandbrakeLever } from "./MechanicalControls";
import { useCockpitState } from "./useCockpitState";
import { DriftBrakeLever, ParkingAppearance } from "./mechanical/index";

export function DriveGearControl() {
  const state = useCockpitState(),
    automatic = usePreferencesStore((s) => s.shiftLayout === "automatic");
  const request = useInputStore((s) => s.input.cockpit_mask),
    confirmed = useVehicleTelemetryStore((s) => s.data.cockpitMask);
  const pending = cockpitCommandPending(request, confirmed, 2, 11),
    selector = pending ? state.current.gear : state.confirmed.gear;
  const selected =
    pending || selector === 0 || selector >= 7
      ? selector
      : state.actualGear === -1
        ? 7
        : (state.actualGear ?? selector);
  return (
    <GearSelector
      automatic={automatic}
      gear={selected}
      disabled={!state.drivetrain}
      pending={pending}
    />
  );
}
/** The HUD uses a momentary drift pull. The full cockpit keeps the mechanical
 * latch gesture; both expose the same confirmed cable detents and gear-safe API. */
export function ParkingBrakeControl({ drift = false }: { drift?: boolean }) {
  const state = useCockpitState();
  const request = useInputStore((s) => s.input.cockpit_mask),
    confirmed = useVehicleTelemetryStore((s) => s.data.cockpitMask);
  const Lever = drift ? DriftBrakeLever : HandbrakeLever;
  return (
    <Lever
      strength={state.current.parkingStrength}
      disabled={!state.supported}
      pending={cockpitCommandPending(request, confirmed, 3)}
    />
  );
}
export function DriveControls({ compact = false }: { compact?: boolean }) {
  return (
    <section className="cockpit-drive-controls">
      <div className="transmission-console" data-compact={compact}>
        <ParkingBrakeControl />
        <DriveGearControl />
        <DriveAssists compact={compact} />
      </div>
      {!compact && <ParkingAppearance />}
    </section>
  );
}
