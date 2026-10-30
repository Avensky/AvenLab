/** Steering-column composition and command wiring. Layout lives in stalks/geometry;
 * Stalk owns gestures, inputStore owns requests, and Rust owns confirmations. */
import { memo, useCallback } from "react";
import { useControlRelease } from "../../controls/useControlRelease";
import { useInputStore } from "../../store/input/inputStore";
import { VehicleFlags, hasFlag } from "../../store/input/protocol/inputMasks";
import { useCockpitState } from "./useCockpitState";
import {
  Stalk,
  STALK_LAYOUTS,
  requestTurnSignal,
  stepTurnSignal,
} from "./stalks/index";
export const ColumnStalks = memo(function ColumnStalks() {
  const state = useCockpitState(),
    flags = useInputStore((s) => s.input.vehicleMask);
  const clearWasher = useCallback(() => {
    const s = useInputStore.getState();
    if ((s.input.cockpit_mask ?? 0) & 4096) s.setCockpit({ washer: false }, 5);
  }, []);
  useControlRelease(clearWasher);
  const detent = hasFlag(flags, VehicleFlags.BLINKER_RIGHT)
    ? 1
    : hasFlag(flags, VehicleFlags.BLINKER_LEFT)
      ? -1
      : 0;
  const change = useInputStore.getState().setCockpit;
  return (
    <div
      className="column-stalks"
      role="group"
      aria-label="Steering column controls"
    >
      <Stalk
        {...STALK_LAYOUTS.lights}
        label="Lights and turn signal stalk"
        words={["R", "L"]}
        asset="headlights.svg"
        mode={["OFF", "AUTO", "ON", "HIGH"][state.confirmed.lights]}
        disabled={!state.supported}
        latched
        repeat
        onHold={
          state.version >= 6
            ? (held) =>
                useInputStore
                  .getState()
                  .setHeadlightFlash(
                    "touch-actions",
                    held,
                    state.cabinMask ?? undefined,
                  )
            : undefined
        }
        detent={detent}
        onUp={() => stepTurnSignal(1)}
        onDown={() => stepTurnSignal(-1)}
        onTurn={() => change({ lights: (state.current.lights + 1) % 3 }, 6)}
        onCancel={() => requestTurnSignal(0)}
      />
      <Stalk
        {...STALK_LAYOUTS.wipers}
        label="Wiper and washer stalk"
        words={["WASH", "WIPE"]}
        asset="windshield-wiper.svg"
        mode={["OFF", "SLOW", "MID", "HIGH"][state.confirmed.wipers]}
        disabled={!state.extended}
        onUp={() => change({ washer: true }, 5)}
        onDown={() => change({}, 10)}
        onRelease={(direction) => {
          if (direction === 1) clearWasher();
        }}
        onTurn={() => change({ wipers: (state.current.wipers + 1) % 4 }, 7)}
      />
      <Stalk
        {...STALK_LAYOUTS.cruise}
        label="Cruise control stalk"
        words={["RES+", "SET−"]}
        asset="cruise-control.svg"
        mode={state.confirmed.cruiseEnabled ? "ON" : "OFF"}
        disabled={!state.extended}
        repeat
        onUp={() => change({}, 8)}
        onDown={() => change({}, 9)}
        onTurn={() =>
          change(
            { cruiseEnabled: !state.current.cruiseEnabled, cruiseAction: 0 },
            4,
          )
        }
        onCancel={() => change({ cruiseAction: 3 }, 4)}
      />
    </div>
  );
});
