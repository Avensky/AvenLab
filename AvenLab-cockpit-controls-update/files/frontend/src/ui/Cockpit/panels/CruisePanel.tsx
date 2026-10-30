import { useInputStore } from "../../../store/input/inputStore";
import { useCockpitState } from "../useCockpitState";
import { useVehicleTelemetryStore } from "../../../store/telemetry/vehicleTelemetryStore";
/** Speed/target updates are local to this mounted page, never the radio/menu
 * shell. The mirrored diagram attaches to the wheel on its left-hand end. */
export function CruisePanel() {
  const { current, confirmed, status, supported, extended } = useCockpitState(),
    change = useInputStore.getState().setCockpit;
  const speed = useVehicleTelemetryStore((s) =>
      Math.round(s.data.speedKph ?? 0),
    ),
    cruiseTarget = useVehicleTelemetryStore((s) => s.data.cruiseTargetKph);
  return (
    <div className="cockpit-system">
      <div className="control-stalk cruise-stalk" data-side="right">
        <span>CANCEL ↗</span>
        <i />
        <b>
          + RES ▲<br />− SET ▼
        </b>
      </div>
      <div className="cruise-readout" data-active={status.cruiseActive}>
        {status.cruiseActive
          ? "CRUISE SET"
          : confirmed.cruiseEnabled
            ? "CRUISE READY"
            : "CRUISE OFF"}
      </div>
      <div className="cockpit-segments">
        <button
          disabled={!supported}
          aria-pressed={current.cruiseEnabled}
          onClick={() =>
            change(
              {
                cruiseEnabled: !current.cruiseEnabled,
                cruiseAction: 0,
              },
              4,
            )
          }
        >
          ON / OFF
        </button>
        <button
          disabled={!supported || !current.cruiseEnabled}
          onClick={() => change({ cruiseAction: 1 }, 4)}
        >
          − SET
        </button>
        <button
          disabled={!supported || !current.cruiseEnabled}
          onClick={() => change({ cruiseAction: 2 }, 4)}
        >
          + RES
        </button>
        <button
          disabled={!supported}
          onClick={() => change({ cruiseAction: 3 }, 4)}
        >
          CANCEL
        </button>
      </div>
      <div className="cockpit-segments">
        <button
          aria-label="Cruise speed down"
          disabled={!extended || !current.cruiseEnabled}
          onClick={() => change({}, 9)}
        >
          − 1 MPH
        </button>
        <button
          aria-label="Cruise speed up"
          disabled={!extended || !current.cruiseEnabled}
          onClick={() => change({}, 8)}
        >
          + 1 MPH
        </button>
      </div>
      <small>
        {speed} KM/H
        {cruiseTarget !== null
          ? ` · SET ${Math.round(cruiseTarget)} KM/H`
          : ""}{" "}
        · BRAKE CANCELS CRUISE
      </small>
    </div>
  );
}
