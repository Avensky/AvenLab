import { useInputStore } from "../../store/inputStore";
import { VehicleFlags, hasFlag } from "../../store/tools/inputMasks";
import { HoldButton } from "../../controls/TouchControls";
import { arcPath } from "./gaugeGeometry";

export function Boost({ fraction, active }: { fraction: number | null; active: boolean }) {
  const requested = useInputStore(s => hasFlag(s.input.vehicleMask, VehicleFlags.BOOST));
  const path = arcPath(80, 80, 86, -4 * Math.PI / 3, 0);
  return <div className="nos-ring" data-active={active} data-requested={requested}>
    <svg viewBox="-9 -9 178 178" aria-hidden="true">
      <path d={path} className="nos-track" pathLength="100" />
      {fraction !== null && <path d={path} className="nos-fill" pathLength="100" strokeDasharray={`${fraction * 100} 100`} />}
    </svg>
    <HoldButton className="nos-button" disabled={fraction === null || fraction <= 0} aria-label="Hold NOS boost" aria-pressed={requested}
      title={fraction === null ? "NOS unavailable for this vehicle" : "Hold NOS · Shift / LB"}
      onHold={held => useInputStore.getState().setHeldVehicleFlag("touch-actions", VehicleFlags.BOOST, held)}>
      <span>NOS</span><strong>{fraction === null ? "—" : `${Math.round(fraction * 100)}%`}</strong>
    </HoldButton>
  </div>;
}
