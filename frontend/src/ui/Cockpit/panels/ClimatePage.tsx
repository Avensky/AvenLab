import { usePreferencesStore } from "../../../store/preferences/index";
import { ClimatePanel } from "../ClimatePanel";

/** Climate is the master visibility gate for the entire clock/hazard/HVAC unit.
 * Size and hazard preferences survive hiding it; none of these edits send a
 * cabin command. Cockpit controls remain available while the driving HUD hides. */
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
            aria-label={value === "compact" ? "COMPACT HUD" : "FULL HUD"}
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
          {visible ? "HIDE HUD" : "SHOW HUD"}
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
          {hazards ? "HIDE HAZARD BUTTON" : "SHOW HAZARD BUTTON"}
        </button>
      </div>
      <div
        className="climate-cockpit-controls"
        aria-label="Cockpit climate controls"
      >
        <ClimatePanel size={size} showHazards={hazards} />
      </div>
    </div>
  );
}
