import type { CSSProperties } from "react";
import { requestParkingStrength } from "./commands";
import { HoldButton } from "../../../controls/TouchControls";
import { useInputStore } from "../../../store/input/inputStore";
import { useMomentaryFeedback } from "../useMomentaryFeedback";
import { parkingLeverPose } from "./geometry";
import { usePreferencesStore } from "../../../store/preferences/index";
import { ParkingDetents, ParkingLeverArtwork } from "./ParkingArtwork";

/** Driving pull: immediate rear brake while held, independent of the latched
 * parking tension. Its own input source prevents touch release erasing keyboard
 * or controller braking. Rust's existing handbrake/tire solver applies the force. */
export function DriftBrakeLever({
  strength,
  disabled,
  pending,
}: {
  strength: number;
  disabled: boolean;
  pending: boolean;
}) {
  const appearance = usePreferencesStore((s) => s.parkingBrakeStyle);
  const contact = useMomentaryFeedback();
  const pressure = useInputStore((s) => s.input.handbrake);
  const pose = parkingLeverPose(Math.max(strength, pressure * 3));
  const select = requestParkingStrength;
  return (
    <section
      {...contact}
      className="mechanical-handbrake drift-parking"
      data-parking-style={appearance}
      style={
        {
          "--parking-angle": `${pose.angle}deg`,
          "--parking-reach": pose.reach,
        } as CSSProperties
      }
    >
      <ParkingDetents
        strength={strength}
        disabled={disabled}
        onSelect={select}
      />
      <HoldButton
        className="handbrake-lever"
        disabled={disabled}
        aria-label="Parking brake"
        aria-busy={pending}
        aria-pressed={pressure > 0 || strength > 0}
        aria-description="Hold to pull the rear brake immediately for drifting; release to let go. Side detents set a parking latch."
        title="Hold to drift; release to let go"
        onHold={(held) =>
          useInputStore
            .getState()
            .setAnalogFromSource("touch-parking", { handbrake: Number(held) })
        }
      >
        <ParkingLeverArtwork />
        <span className="parking-pull-label">PULL</span>
      </HoldButton>
      <button
        className="parking-release"
        type="button"
        aria-label="Release parked brake"
        title="Release parking latch"
        disabled={disabled || strength === 0}
        onClick={() => select(0)}
      >
        0
      </button>
    </section>
  );
}
