import { usePreferencesStore } from "../store/preferences/preferencesStore";
import { useVehicleTelemetryStore } from "../store/telemetry/vehicleTelemetryStore";
import { useGameStore } from "../store/presentation/gameStore";
import {
  enterInspection,
  leaveInspection,
} from "../store/presentation/inspectionActions";
export function InspectionPanel() {
  const editor = useGameStore((s) => s.editor),
    sensitivity = usePreferencesStore((s) => s.steeringSensitivity),
    speed = useVehicleTelemetryStore((s) => s.data.speedKph);
  if (!editor) return null;
  return (
    <section className="inspection-panel" aria-label="Vehicle inspection">
      <strong>VEHICLE INSPECTOR</strong>
      <div>
        {(["suspension", "collider", "handling"] as const).map((p) => (
          <button key={p} onClick={() => enterInspection(p)}>
            {p.toUpperCase()}
          </button>
        ))}
      </div>
      <span>
        {speed === null ? "—" : Math.round(speed)} KM/H · DRAG TO ORBIT · SCROLL
        TO ZOOM
      </span>
      <label>
        STEERING INPUT{" "}
        <input
          aria-label="Inspector steering sensitivity"
          type="range"
          min=".5"
          max="1.5"
          step=".05"
          value={sensitivity}
          onChange={(e) =>
            usePreferencesStore
              .getState()
              .update({ steeringSensitivity: Number(e.target.value) })
          }
        />
      </label>
      <small>
        Collider and spring geometry follow server telemetry. Server physics
        tuning is read-only.
      </small>
      <button onClick={leaveInspection}>RETURN TO DRIVING VIEW</button>
    </section>
  );
}
