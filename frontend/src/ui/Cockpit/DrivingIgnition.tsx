import { usePreferencesStore } from "../../store/preferences";
import { useVehicleTelemetryStore } from "../../store/telemetry";
import { HudGroup } from "../HudGroup";
import { IgnitionSwitch } from "./IgnitionSwitch";
/** Only a boolean threshold subscribes this wrapper. A moving engine key fades
 * until pointer / keyboard focus; ignition remains available in the cockpit. */
export function DrivingIgnition() {
  const policy = usePreferencesStore((s) => s.ignitionVisibility),
    moving = useVehicleTelemetryStore(
      (s) => (s.data.speedKph ?? 0) > 5 && s.data.engineOn,
    );
  if (policy === "hidden") return null;
  return (
    <HudGroup
      id="ignition"
      title="IGNITION"
      className={`ignition-hud${policy === "auto" && moving ? " ignition-quiet" : ""}`}
    >
      <IgnitionSwitch />
    </HudGroup>
  );
}
