import { useEffect, useRef } from "react";
import { useVehicleTelemetryStore } from "../../../store/telemetry/vehicleTelemetryStore";
import { useInputStore } from "../../../store/input/inputStore";
import { useCockpitState } from "../useCockpitState";
/** Only this visible page subscribes to the transient wipe-cycle telltale.
 * A washer tap is bounded; leaving the page always clears the pending wash. */
export function WipersPanel() {
  const { current, confirmed, supported, extended } = useCockpitState(),
    change = useInputStore.getState().setCockpit;
  const cycle = useVehicleTelemetryStore((s) =>
      Boolean((s.data.cabinMask ?? 0) & 32768),
    ),
    timer = useRef<number | null>(null);
  const wash = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    change({ washer: true }, 5);
    timer.current = window.setTimeout(() => {
      change({ washer: false }, 5);
      timer.current = null;
    }, 400);
  };
  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        useInputStore.getState().setCockpit({ washer: false }, 5);
      }
    },
    [],
  );
  return (
    <div className="cockpit-system">
      <div className="control-stalk stalk-right" data-side="right">
        <span>WASH ↗</span>
        <i />
        <b>OFF · LOW · MID · HIGH</b>
      </div>
      <div
        className="wiper-window"
        data-speed={confirmed.wipers || (cycle ? 1 : 0)}
      >
        <span />
        <span />
      </div>
      <div className="cockpit-segments">
        {["OFF", "LOW", "MID", "HIGH"].map((label, index) => (
          <button
            key={label}
            disabled={!supported}
            aria-label={`Wipers ${label.toLowerCase()}`}
            aria-pressed={current.wipers === index}
            onClick={() => change({ wipers: index }, 7)}
          >
            {label}
          </button>
        ))}
      </div>
      <button className="wash-button" disabled={!supported} onClick={wash}>
        WINDSHIELD WASH
      </button>
      <button
        className="wash-button"
        disabled={!extended}
        onClick={() => change({}, 10)}
      >
        WIPE ONCE
      </button>
    </div>
  );
}
