import { usePreferencesStore } from "../../../store/preferences/index";
import { ClimatePanel } from "../ClimatePanel";

/** Saved size controls both the live preview and driving widget. Choosing
 * compact restores emergency-light visibility and actually removes the dials. */
export function ClimatePage() {
  const hazards = usePreferencesStore((s) => s.hudGroups.hazards);
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
              usePreferencesStore.getState().update({
                climateHudSize: value,
                ...(value === "compact"
                  ? {
                      hudGroups: {
                        ...usePreferencesStore.getState().hudGroups,
                        hazards: true,
                      },
                    }
                  : {}),
              })
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
        <button
          type="button"
          role="switch"
          aria-label="Emergency lights on driving HUD"
          aria-checked={hazards}
          onClick={() =>
            usePreferencesStore.getState().setHudGroup("hazards", !hazards)
          }
        >
          EMERGENCY LIGHTS: {hazards ? "SHOW" : "HIDE"}
        </button>
      </div>
      <ClimatePanel size={size} />
    </div>
  );
}
