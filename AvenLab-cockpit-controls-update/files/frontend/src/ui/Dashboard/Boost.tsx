import { useInputStore } from "../../store/input/inputStore";
import { VehicleFlags, hasFlag } from "../../store/input/protocol/inputMasks";
import { HoldButton } from "../../controls/TouchControls";

export function Boost({
  fraction,
  active,
}: {
  fraction: number | null;
  active: boolean;
}) {
  const requested = useInputStore((s) =>
    hasFlag(s.input.vehicleMask, VehicleFlags.BOOST),
  );
  return (
    <div className="nos-line" data-active={active} data-requested={requested}>
      <HoldButton
        className="nos-button resource-line"
        disabled={fraction === null || fraction <= 0}
        aria-label="Hold NOS boost"
        aria-pressed={requested}
        title={
          fraction === null
            ? "NOS unavailable for this vehicle"
            : "Hold NOS · Shift / LB"
        }
        onHold={(held) =>
          useInputStore
            .getState()
            .setHeldVehicleFlag("touch-actions", VehicleFlags.BOOST, held)
        }
      >
        <span>NOS</span>
        <strong>
          {fraction === null ? "—" : `${Math.round(fraction * 100)}%`}
        </strong>
        <i aria-hidden="true">
          <b style={{ transform: `scaleX(${fraction ?? 0})` }} />
        </i>
      </HoldButton>
    </div>
  );
}
