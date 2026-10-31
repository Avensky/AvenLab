import { IgnitionSwitch } from "../IgnitionSwitch";
import { RadioPanel } from "../RadioPanel";
import { HudVisibilityToggle } from "./HudVisibilityToggle";

/** The cockpit page stays usable when its driving widget is hidden. Keep the
 * visibility shortcut outside the actual radio/key so previews never hide it. */
export function RadioPage() {
  return (
    <div className="cockpit-radio-page">
      <div className="cockpit-hud-options">
        <HudVisibilityToggle id="display" label="Radio on driving HUD" />
      </div>
      <RadioPanel />
    </div>
  );
}

export function IgnitionPage() {
  return (
    <div className="cockpit-ignition-page">
      <div className="cockpit-hud-options">
        <HudVisibilityToggle id="ignition" label="Ignition on driving HUD" />
      </div>
      <IgnitionSwitch />
    </div>
  );
}
