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
        <div
          className="radio-style-buttons"
          role="group"
          aria-label="Radio HUD style"
        >
          {(
            [
              [
                "streamlined",
                "MINIMIZED",
                "Title, power and missions; no transport dials or tab bar",
              ],
              [
                "classic",
                "WITH DIALS",
                "Transport controls, volume dial and Radio/Missions tabs",
              ],
              [
                "no-tabs",
                "NO TAB BAR",
                "Transport controls and volume dial; open missions beside power",
              ],
            ] as const
          ).map(([value, label, title]) => (
            <button
              key={value}
              type="button"
              title={title}
              aria-pressed={style === value}
              onClick={() =>
                usePreferencesStore.getState().update({ radioHudStyle: value })
              }
            >
              {label}
            </button>
          ))}
        </div>
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
