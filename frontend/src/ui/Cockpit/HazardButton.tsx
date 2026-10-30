import { useInputStore } from "../../store/input/inputStore";
import { hasFlag, VehicleFlags } from "../../store/input/protocol/inputMasks";
import { useMomentaryFeedback } from "./useMomentaryFeedback";

/** Shared emergency-light switch. This changes the vehicle flag; its visibility
 * is a separate preference. Press glow releases even while hazards stay on. */
export function HazardButton({
  text = false,
  round = false,
}: {
  text?: boolean;
  round?: boolean;
}) {
  const flags = useInputStore((s) => s.input.vehicleMask),
    contact = useMomentaryFeedback();
  return (
    <button
      {...contact}
      type="button"
      className="physical-hazard"
      data-shape={round ? "round" : "triangle"}
      aria-label="Hazards"
      aria-pressed={hasFlag(flags, VehicleFlags.HAZARDS)}
      onClick={() =>
        useInputStore.getState().toggleVehicleFlag(VehicleFlags.HAZARDS)
      }
    >
      {text ? (
        "HAZARDS"
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3 22 21H2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M12 9v5m0 2v2" stroke="currentColor" strokeWidth="2" />
        </svg>
      )}
    </button>
  );
}
