import { useInputStore } from "../../store/input/inputStore";
import { useVehicleTelemetryStore } from "../../store/telemetry/vehicleTelemetryStore";
import { CabinClock } from "./CabinClock";
import { RotaryKnob } from "./RotaryKnob";
import { useCockpitState } from "./useCockpitState";
import { useMomentaryFeedback } from "./useMomentaryFeedback";
const outlets = ["FACE", "FACE / FEET", "FEET", "FEET / DEF", "DEFROST"];
/** Cabin HVAC controls. Emergency lights have a separate HUD widget. Size is chosen on the Climate tab, so no
 * expand/collapse arrows are needed in the driving HUD. */
export function ClimatePanel({ size = "full" }: { size?: "compact" | "full" }) {
  const { cabin, confirmedCabin, extended, climate, cabinMask, cabinPending } =
    useCockpitState();
  const ambient = useVehicleTelemetryStore((s) => s.data.config.ambientTempC),
    set = useInputStore.getState().setCabin;
  const change = (patch: Parameters<typeof set>[0]) =>
    set(patch, cabinMask ?? undefined);
  const feedback = useMomentaryFeedback();
  return (
    <section
      {...feedback}
      className="climate-panel"
      aria-label="Cabin controls"
      data-pending={cabinPending}
      data-expanded="true"
      data-size={size}
    >
      <div className="console-clock-strip">
        <CabinClock />
        <output aria-label="Ambient temperature">
          {ambient === null ? "—" : Math.round((ambient * 9) / 5 + 32)}°F
        </output>
      </div>
      <div className="climate-three-knobs">
        <RotaryKnob
          label="AIR FLOW"
          value={cabin.airflow}
          min={0}
          max={4}
          readout={outlets[cabin.airflow]}
          disabled={!climate}
          onChange={(value) =>
            change({
              airflow: value,
              frontDefrost: value >= 3,
              ...(value >= 3 ? { recirculate: false } : {}),
            })
          }
          action="RECIRC"
          active={confirmedCabin.recirculate}
          onAction={() => change({ recirculate: !cabin.recirculate })}
        />
        <RotaryKnob
          label="FAN"
          value={cabin.fan}
          min={0}
          max={4}
          readout={cabin.fan ? String(cabin.fan) : "OFF"}
          disabled={!climate}
          onChange={(value) => change({ fan: value })}
          action="REAR DEF"
          active={confirmedCabin.rearDefrost}
          onAction={() => change({ rearDefrost: !cabin.rearDefrost })}
        />
        <RotaryKnob
          label="TEMP"
          value={cabin.temperatureC}
          min={16}
          max={30}
          readout={`${Math.round((cabin.temperatureC * 9) / 5 + 32)}°F`}
          disabled={!extended}
          onChange={(value) => change({ temperatureC: value })}
          action="A/C"
          active={confirmedCabin.ac}
          onAction={() => change({ ac: !cabin.ac })}
        />
      </div>
    </section>
  );
}
