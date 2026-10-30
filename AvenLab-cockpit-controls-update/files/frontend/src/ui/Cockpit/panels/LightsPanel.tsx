import { toggleTurnSignal } from "../stalks/commands";
/** Lighting detents and vertical turn-lever targets. Up is right, down is left;
 * visible arrows change direction without changing the shared vehicle masks. */
import { useInputStore } from "../../../store/input/inputStore";
import { useCockpitState } from "../useCockpitState";
import {
  VehicleFlags,
  hasFlag,
} from "../../../store/input/protocol/inputMasks";
export function LightsPanel() {
  const { current, supported } = useCockpitState(),
    vehicle = useInputStore((s) => s.input.vehicleMask),
    change = useInputStore.getState().setCockpit;
  return (
    <div className="cockpit-system">
      <div className="control-stalk stalk-left">
        <span>▲ TURN ▼</span>
        <i />
        <b>OFF · AUTO · LOW · HIGH</b>
      </div>
      <div className="cockpit-segments">
        {["OFF", "AUTO", "LOW", "HIGH"].map((label, index) => (
          <button
            key={label}
            disabled={!supported}
            aria-label={`Lights ${label.toLowerCase()}`}
            aria-pressed={current.lights === index}
            onClick={() => change({ lights: index }, 6)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="wheel-signals turn-signal-lever">
        <button
          aria-label="Right indicator"
          aria-pressed={hasFlag(vehicle, VehicleFlags.BLINKER_RIGHT)}
          onClick={() => toggleTurnSignal(1)}
        >
          ▲
        </button>
        <div className="digital-wheel">
          <i />
          <b />
        </div>
        <button
          aria-label="Left indicator"
          aria-pressed={hasFlag(vehicle, VehicleFlags.BLINKER_LEFT)}
          onClick={() => toggleTurnSignal(-1)}
        >
          ▼
        </button>
      </div>
    </div>
  );
}
