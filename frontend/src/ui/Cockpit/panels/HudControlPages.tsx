import { usePreferencesStore } from "../../../store/preferences/preferencesStore";
import { IgnitionSwitch } from "../IgnitionSwitch";
import { RadioPanel } from "../RadioPanel";
import { HudVisibilityToggle } from "./HudVisibilityToggle";

/** The cockpit page stays usable when its driving widget is hidden. Keep the
 * visibility shortcut outside the actual radio/key so previews never hide it. */
export function RadioPage() {
  const style = usePreferencesStore((s) => s.radioHudStyle);
  return (
    <div className="cockpit-radio-page">
      <div className="cockpit-hud-options">
        <HudVisibilityToggle id="display" label="Radio on driving HUD" />
        <label>
          RADIO STYLE{" "}
          <select
            aria-label="Radio HUD style"
            value={style}
            onChange={(event) =>
              usePreferencesStore
                .getState()
                .update({
                  radioHudStyle: event.currentTarget.value as
                    | "classic"
                    | "streamlined",
                })
            }
          >
            <option value="classic">CLASSIC · TRANSPORT CONTROLS</option>
            <option value="streamlined">STREAMLINED · TITLE & STATUS</option>
          </select>
        </label>
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
