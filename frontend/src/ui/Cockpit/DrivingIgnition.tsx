import { usePreferencesStore } from "../../store/preferences";
import { HudGroup } from "../HudGroup";
import { IgnitionSwitch } from "./IgnitionSwitch";
export function DrivingIgnition() {
  const policy = usePreferencesStore((s) => s.ignitionVisibility);
  if (policy === "hidden") return null;
  return (
    <HudGroup
      id="ignition"
      title="IGNITION"
      className="ignition-hud"
    >
      <IgnitionSwitch />
    </HudGroup>
  );
}
