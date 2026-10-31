import { UtilityToggle } from "../hud/UtilityToggle";
import { CabinPerformance } from "../hud/CabinPerformance";
import { HazardButton } from "./HazardButton";
import { useInputStore } from "../../store/input/inputStore";
import { useVehicleTelemetryStore } from "../../store/telemetry/vehicleTelemetryStore";
import { CabinClock } from "./CabinClock";
import { RotaryKnob } from "./RotaryKnob";
import { useCockpitState } from "./useCockpitState";
import { useMomentaryFeedback } from "./useMomentaryFeedback";
const outlets = ["FACE", "FACE / FEET", "FEET", "FEET / DEF", "DEFROST"];
/** One framed radio-style HVAC unit. Full shows cabin knobs; compact shows its
 * clock/ambient strip and centered round hazard switch. No collapse arrows. */
export function ClimatePanel({
  size = "full",
  showHazards = true,
  controlsVisible = true,
  onMinimize,
  performanceReadout = false,
}: {
  size?: "compact" | "full";
  showHazards?: boolean;
  controlsVisible?: boolean;
  onMinimize?: () => void;
  performanceReadout?: boolean;
}) {
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
      data-controls-visible={controlsVisible}
    >
      {onMinimize && (
        <UtilityToggle panel="climate" open={true} onClick={onMinimize} />
      )}
      <div className="console-clock-strip">
        <CabinClock />
        {showHazards && <HazardButton round />}
        <output aria-label="Ambient temperature">
          {ambient === null ? "—" : Math.round((ambient * 9) / 5 + 32)}°F
        </output>
      </div>
      {performanceReadout && size === "compact" && <CabinPerformance />}
      {controlsVisible && size === "full" && (
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
      )}
    </section>
  );
}
