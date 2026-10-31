import { UtilityToggle } from "./UtilityToggle";
import type { CSSProperties } from "react";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { useHudPanelsStore } from "../../store/hud/hudPanelsStore";
import { Minimap } from "../Minimap/Minimap";
import { ConsoleDisplay } from "../Cockpit/ConsoleDisplay";
import { ClimatePanel } from "../Cockpit/ClimatePanel";
import "./utilityDock.css";

/** One layout owner packs GPS, media and HVAC. The map's height is a real grid
 * row, so media always drops below an open map and rises when it minimizes. */
export function UtilityDock() {
  const reduced = usePreferencesStore((state) => state.reducedMotion);
  const groups = usePreferencesStore((state) => state.hudGroups);
  const enabled = usePreferencesStore((state) => state.showDriveControls);
  const scale = usePreferencesStore((state) => state.minimapScale);
  const climateSize = usePreferencesStore((state) => state.climateHudSize);
  const map = useHudPanelsStore((state) => state.map);
  const radio = useHudPanelsStore((state) => state.radio);
  const climate = useHudPanelsStore((state) => state.climate);
  const toggle = useHudPanelsStore.getState().toggle;
  const mapOpen = groups.minimap && map;
  const showRadio = enabled && groups.display,
    showClimate = enabled && groups.climate;
  if (!groups.minimap && !showRadio && !showClimate) return null;
  return (
    <aside
      className="hud-utilities"
      data-reduced-motion={reduced}
      aria-label="Navigation and cabin widgets"
      data-map-open={mapOpen}
      data-radio-open={showRadio && radio}
      style={{ "--minimap-scale": scale } as CSSProperties}
    >
      <div className="utility-map-row">
        <Minimap />
        <div className="utility-launchers" data-on-rim={mapOpen}>
          {showRadio && !radio && (
            <UtilityToggle
              panel="radio"
              open={false}
              onClick={() => toggle("radio")}
            />
          )}
          {showClimate && !climate && (
            <UtilityToggle
              panel="climate"
              open={false}
              onClick={() => toggle("climate")}
            />
          )}
        </div>
      </div>
      {showRadio && radio && (
        <section
          className="hud-group utility-radio"
          data-hud-group="display"
          aria-label="VEHICLE DISPLAY group"
        >
          <ConsoleDisplay onMinimize={() => toggle("radio")} />
        </section>
      )}
      {showClimate && climate && (
        <section
          className="hud-group hud-climate utility-climate"
          data-hud-group="climate"
          aria-label="CLIMATE group"
        >
          <ClimatePanel
            size={climateSize}
            showHazards={groups.hazards}
            onMinimize={() => toggle("climate")}
          />
        </section>
      )}
    </aside>
  );
}
