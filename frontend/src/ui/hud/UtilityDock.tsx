import { UtilityToggle } from "./UtilityToggle";
import { memo, useLayoutEffect, useRef, type CSSProperties } from "react";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { useHudPanelsStore } from "../../store/hud/hudPanelsStore";
import { Minimap } from "../Minimap/Minimap";
import { ConsoleDisplay } from "../Cockpit/ConsoleDisplay";
import { ClimatePanel } from "../Cockpit/ClimatePanel";
import { CabinPerformance } from "./CabinPerformance";
import { HazardButton } from "../Cockpit/HazardButton";
import { useNetworkStore } from "../../store/session/networkStore";
import { observeHudLayout, setHudStyle } from "./observeHudLayout";
import "./utilityDock.css";

/** One layout owner packs GPS, media and HVAC. The map's height is a real grid
 * row, so media always drops below an open map and rises when it minimizes. */
export const UtilityDock = memo(function UtilityDock() {
  const root = useRef<HTMLElement>(null);
  const match = useNetworkStore((state) => Boolean(state.snapshot?.match_state));
  const reduced = usePreferencesStore((state) => state.reducedMotion);
  const groups = usePreferencesStore((state) => state.hudGroups);
  const scale = usePreferencesStore((state) => state.minimapScale);
  const climateSize = usePreferencesStore((state) => state.climateHudSize);
  const map = useHudPanelsStore((state) => state.map);
  const radio = useHudPanelsStore((state) => state.radio);
  const climate = useHudPanelsStore((state) => state.climate);
  const toggle = useHudPanelsStore.getState().toggle;
  const mapOpen = groups.minimap && map;
  const showRadio = groups.display,
    showMissions = groups.missions,
    showDisplay = showRadio || showMissions,
    showClimate = groups.climate;
  const inlinePerformance = groups.performance && showClimate && climate && climateSize === "compact";
  useLayoutEffect(() => {
    const element = root.current, hud = element?.closest('.driving-hud');
    if (!element || !hud) return;
    // Run only when the layout changes. Snapshot positions and telemetry never
    // poll geometry; gauges and the score own space before the utility column.
    const readTargets = () => [element, ...hud.querySelectorAll('.hud-top-left,.instrument-hud,.teammate-hud'), ...document.querySelectorAll('.ctf-match-hud')];
    let baseline = 8;
    const resetBaseline = () => {
      // The CSS/safe-area anchor only changes on a real viewport/layout edit,
      // never on every ResizeObserver notification or telemetry sample.
      element.style.removeProperty('top');
      baseline = element.getBoundingClientRect().top;
    };
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      let top = baseline;
      for (const node of readTargets()) {
        if (node === element) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.right > bounds.left && rect.left < bounds.right)
          top = Math.max(top, rect.bottom + 8);
      }
      setHudStyle(element, 'top', `${top}px`);
      setHudStyle(element, 'max-height', `${Math.max(40, window.innerHeight - top - 12)}px`);
    };
    resetBaseline();
    window.addEventListener('resize', resetBaseline);
    const stop = observeHudLayout(hud, readTargets, measure);
    return () => {stop();window.removeEventListener('resize', resetBaseline);};
  }, [groups, radio, climate, climateSize, match]);
  if (!groups.minimap && !showDisplay && !showClimate && !groups.performance && !groups.hazards) return null;
  return (
    <aside
      ref={root}
      className="hud-utilities"
      data-reduced-motion={reduced}
      aria-label="Navigation and cabin widgets"
      data-map-open={mapOpen}
      data-radio-open={showDisplay && radio}
      data-panels-open={(showDisplay && radio) || (showClimate && climate)}
      style={{ "--minimap-scale": scale } as CSSProperties}
    >
      <div className="utility-map-row">
        <Minimap />
        <div className="utility-launchers" data-on-rim={mapOpen}>
          {showDisplay && !radio && (
            <UtilityToggle
              key="radio-launcher"
              panel={showRadio ? "radio" : "missions"}
              open={false}
              onClick={() => toggle("radio")}
            />
          )}
          {showClimate && !climate && (
            <UtilityToggle
              key="climate-launcher"
              panel="climate"
              open={false}
              onClick={() => toggle("climate")}
            />
          )}
        </div>
      </div>
      {showDisplay && radio && (
        <section
          className="hud-group utility-radio"
          data-hud-group={showRadio ? "display" : "missions"}
          aria-label="VEHICLE DISPLAY group"
        >
          <ConsoleDisplay showRadio={showRadio} showMissions={showMissions} onMinimize={() => toggle("radio")} />
        </section>
      )}
      {showClimate && climate && (
        <section
          className="hud-group hud-climate utility-climate"
          data-hud-group="climate"
          aria-label="CLIMATE group"
        >
          <ClimatePanel
            performanceReadout={inlinePerformance}
            size={climateSize}
            showHazards={groups.hazards}
            onMinimize={() => toggle("climate")}
          />
        </section>
      )}
      {((groups.performance && !inlinePerformance) || (groups.hazards && (!showClimate || !climate))) && (
        <section className="utility-readouts" aria-label="Independent HUD readouts">
          {groups.performance && !inlinePerformance && <div data-hud-group="performance"><CabinPerformance /></div>}
          {groups.hazards && (!showClimate || !climate) && <div data-hud-group="hazards"><HazardButton round /></div>}
        </section>
      )}
    </aside>
  );
});
