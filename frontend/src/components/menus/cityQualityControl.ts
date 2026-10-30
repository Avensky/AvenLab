import type { MenuRow } from "./TabbedMenu";
import { useRenderSettingsStore } from "../../store/presentation/renderSettingsStore";
import type { useDebugViewStore } from "../../store/presentation/debugViewStore";
import { CITY_QUALITIES, CITY_QUALITY_LABELS } from "../../world/cityLod";
import {
  CITY_VIEW_DISTANCES,
  resolveCityViewDistance,
} from "../../world/cityViewDistance";
import { DEFAULT_INTERPOLATION_DELAY_MS } from "../../hooks/usePhysicsInterpolator";

export function cityQualityControl(
  settings: ReturnType<typeof useRenderSettingsStore.getState>,
): MenuRow {
  return {
    id: "city-quality",
    label: "City detail",
    value: CITY_QUALITY_LABELS[settings.cityQuality],
    description:
      "Model detail and texture resolution. Original renders all loaded models.",
    action: (direction = 1) => {
      const current = useRenderSettingsStore.getState();
      current.update({
        cityQuality:
          CITY_QUALITIES[
            (CITY_QUALITIES.indexOf(current.cityQuality) +
              direction +
              CITY_QUALITIES.length) %
              CITY_QUALITIES.length
          ],
      });
    },
  };
}
export function cityViewDistanceControl(
  settings: ReturnType<typeof useRenderSettingsStore.getState>,
): MenuRow {
  const original = settings.cityQuality === "original";
  const distance = resolveCityViewDistance(
    settings.cityQuality,
    settings.cityViewDistance,
  );
  return {
    id: "city-view-distance",
    label: "View distance",
    disabled: original,
    value: original
      ? "All loaded"
      : settings.cityViewDistance === "auto"
        ? `Auto · ${distance} m`
        : `${distance} m`,
    description: original
      ? "Available with Fast or Balanced city detail."
      : undefined,
    action: (direction = 1) => {
      const current = useRenderSettingsStore.getState();
      if (current.cityQuality === "original") return;
      current.update({
        cityViewDistance:
          CITY_VIEW_DISTANCES[
            (Math.max(
              0,
              CITY_VIEW_DISTANCES.indexOf(current.cityViewDistance),
            ) +
              direction +
              CITY_VIEW_DISTANCES.length) %
              CITY_VIEW_DISTANCES.length
          ],
      });
    },
  };
}
export function interpolationControl(
  debug: ReturnType<typeof useDebugViewStore.getState>,
): MenuRow {
  return {
    id: "interpolation",
    label: "Vehicle interpolation",
    value: debug.interpolationEnabled
      ? `On · ${DEFAULT_INTERPOLATION_DELAY_MS} ms`
      : "Off · latest snapshot",
    action: () => debug.toggleInterpolation(),
  };
}
export function cityPerformanceControl(
  settings: ReturnType<typeof useRenderSettingsStore.getState>,
): MenuRow {
  return {
    id: "city-performance",
    label: "Apply mobile performance preset",
    adjustable: false,
    description:
      "Nearby models, a simpler skyline, distance fog and expensive effects off. Keeps your input and HUD choices.",
    action: () => settings.cityPerformancePreset(),
  };
}
