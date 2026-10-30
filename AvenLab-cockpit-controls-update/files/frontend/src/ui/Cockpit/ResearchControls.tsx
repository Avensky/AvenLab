import { canDrive } from "../../controls/inputRouting";
import { HoldButton } from "../../controls/TouchControls";
import { useInputStore } from "../../store/input/inputStore";
import {
  PlayerFlags,
  VehicleFlags,
  hasFlag,
} from "../../store/input/protocol/inputMasks";
import { HazardButton } from "./HazardButton";
import { useCockpitState } from "./useCockpitState";

export function ResearchControls() {
  const flags = useInputStore((s) => s.input.vehicleMask),
    player = useInputStore((s) => s.input.playerMask),
    store = useInputStore.getState(),
    state = useCockpitState(),
    driving = canDrive();
  return (
    <div className="console-command-grid">
      {(
        [
          [VehicleFlags.HEADLIGHTS, "LIGHTS"],
          [VehicleFlags.BLINKER_LEFT, "LEFT"],
          [VehicleFlags.BLINKER_RIGHT, "RIGHT"],
          [VehicleFlags.ABS, "ABS"],
        ] as const
      ).map(([flag, label]) => (
        <button
          type="button"
          key={flag}
          aria-pressed={hasFlag(flags, flag)}
          onClick={() => store.toggleVehicleFlag(flag)}
        >
          {label}
        </button>
      ))}
      <HazardButton />
      <button
        type="button"
        disabled={!state.supported}
        onClick={() =>
          store.setAssist(
            state.confirmed.assist === 1 ? 1 : state.tcs ? 2 : 0,
            !state.tcs,
          )
        }
      >
        TRAC
      </button>
      {(
        [
          [PlayerFlags.CANDUMP, "CAN LOG"],
          [PlayerFlags.LIVECAN, "LIVE CAN"],
          [PlayerFlags.DYNO, "DYNO"],
        ] as const
      ).map(([flag, label]) => (
        <button
          type="button"
          key={label}
          aria-pressed={hasFlag(player, flag)}
          onClick={() => store.togglePlayerFlag(flag)}
        >
          {label}
        </button>
      ))}
      <HoldButton
        disabled={!driving}
        aria-label="Hold NOS boost"
        onHold={(held) =>
          store.setHeldVehicleFlag("touch-actions", VehicleFlags.BOOST, held)
        }
      >
        NOS
      </HoldButton>
      <HoldButton
        disabled={!driving}
        aria-label="Horn"
        onHold={(held) =>
          store.setHeldPlayerFlag("touch-actions", PlayerFlags.HONK, held)
        }
      >
        HORN
      </HoldButton>
      <HoldButton
        disabled={!driving}
        aria-label="Reset vehicle"
        onHold={(held) =>
          store.setHeldPlayerFlag("touch-actions", PlayerFlags.RESET, held)
        }
      >
        RESET
      </HoldButton>
      <button
        type="button"
        disabled={!state.extended}
        onClick={() => store.setCockpit({}, 10)}
      >
        WIPE ONCE
      </button>
    </div>
  );
}
