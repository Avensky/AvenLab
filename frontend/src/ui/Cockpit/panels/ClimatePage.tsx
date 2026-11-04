import { usePreferencesStore } from "../../../store/preferences/index";
import { ClimatePanel } from "../ClimatePanel";
import { HudVisibilityToggle } from "./HudVisibilityToggle";
import { CLIMATE_HUD_LABELS, CLIMATE_HUD_SIZES } from "../../../store/preferences/hudVisibility";

/** The presets change presentation only; independent widget switches remain
 * available below. The cockpit preview never disappears with the driving HUD. */
export function ClimatePage() {
  const hazards = usePreferencesStore((s) => s.hudGroups.hazards);
  const size = usePreferencesStore((s) => s.climateHudSize);
  return (
    <div className="cockpit-climate-page">
      <div
        className="climate-layout-choice"
        role="group"
        aria-label="Driving climate control size"
      >
        {CLIMATE_HUD_SIZES.map((value) => (
          <button
            key={value}
            type="button"
            aria-label={CLIMATE_HUD_LABELS[value]}
            aria-pressed={size === value}
            onClick={() =>
              usePreferencesStore.getState().update({
                climateHudSize: value,
                ...(value === "single" ? {hudGroups: {performance: false}} : value === "compact" ? {hudGroups: {hazards: true, performance: true}} : {}),
              })
            }
          >
            {CLIMATE_HUD_LABELS[value]}
          </button>
        ))}
        <HudVisibilityToggle
          id="climate"
          label="Climate controls on driving HUD"
        />
        <HudVisibilityToggle id="performance" label="Performance readout on driving HUD" />
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
