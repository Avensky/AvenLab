import { usePreferencesStore } from "../../../store/preferences/index";
import Dashboard from "../../Dashboard/Dashboard";

/** Display settings use the same saved preferences as the driving HUD. The
 * preview mounts the real instruments, so color, engine dimming and brightness
 * cannot drift into a separate mock. No vehicle command is sent here. */
export function BrightnessPage() {
  const level = usePreferencesStore((s) => s.dashboardBrightness);
  const visible = usePreferencesStore((s) => s.hudGroups.gauges);
  const percent = Math.round(level * 100);
  const change = (value: number) =>
    usePreferencesStore.getState().update({
      dashboardBrightness: Math.round(value) / 100,
    });
  return (
    <div className="cockpit-brightness-page">
      <fieldset className="dashboard-preferences">
        <legend>DASHBOARD</legend>
        <label htmlFor="dashboard-brightness">
          Brightness <output htmlFor="dashboard-brightness">{percent}%</output>
        </label>
        <input
          id="dashboard-brightness"
          type="range"
          role="slider"
          aria-label="Dashboard brightness"
          aria-disabled="false"
          aria-valuemin={10}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent} percent`}
          min={10}
          max={100}
          step={5}
          value={percent}
          onChange={(e) => change(Number(e.currentTarget.value))}
          onKeyDown={(e) => {
            // Explicit steps also support controller-generated keyboard events.
            const step = {
              ArrowLeft: -5,
              ArrowDown: -5,
              ArrowRight: 5,
              ArrowUp: 5,
            }[e.key];
            if (step === undefined && e.key !== "Home" && e.key !== "End")
              return;
            e.preventDefault();
            e.stopPropagation();
            change(
              e.key === "Home"
                ? 10
                : e.key === "End"
                  ? 100
                  : percent + (step ?? 0),
            );
          }}
        />
        <div>
          <button type="button" onClick={() => change(100)}>
            RESET BRIGHTNESS
          </button>
          <button
            type="button"
            role="switch"
            aria-label="Dashboard on driving HUD"
            aria-checked={visible}
            onClick={() =>
              usePreferencesStore.getState().setHudGroup("gauges", !visible)
            }
          >
            DASHBOARD: {visible ? "SHOW" : "HIDE"}
          </button>
        </div>
      </fieldset>
      <div className="dashboard-preview" aria-label="Dashboard preview">
        <Dashboard />
      </div>
    </div>
  );
}
