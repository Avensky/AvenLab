import { usePreferencesStore } from "../../../store/preferences/index";
import { ClimatePanel } from "../ClimatePanel";

/** Full-size cabin controls stay on their own page. The size choice configures
 * the driving widget, replacing the old cluster of expand/collapse arrows. */
export function ClimatePage() {
  const size = usePreferencesStore((s) => s.climateHudSize),
    visible = usePreferencesStore((s) => s.hudGroups.climate);
  return (
    <div className="cockpit-climate-page">
      <div
        className="climate-layout-choice"
        role="group"
        aria-label="Driving climate control size"
      >
        {(["compact", "full"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={size === value}
            onClick={() =>
              usePreferencesStore.getState().update({ climateHudSize: value })
            }
          >
            {value === "compact" ? "COMPACT HUD" : "FULL HUD"}
          </button>
        ))}
        <button
          type="button"
          role="switch"
          aria-label="Climate controls on driving HUD"
          aria-checked={visible}
          onClick={() =>
            usePreferencesStore.getState().setHudGroup("climate", !visible)
          }
        >
          {visible ? "HUD: SHOW" : "HUD: HIDE"}
        </button>
      </div>
      <ClimatePanel size="full" />
    </div>
  );
}
