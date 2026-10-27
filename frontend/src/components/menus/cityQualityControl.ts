import type { MenuRow } from "./TabbedMenu";
import type { useRenderSettingsStore } from "../../store/renderSettingsStore";
import { CITY_QUALITIES, CITY_QUALITY_LABELS } from "../../world/cityLod";

export function cityQualityControl(settings: ReturnType<typeof useRenderSettingsStore.getState>): MenuRow {
  return { id: "city-quality", label: "City detail", value: CITY_QUALITY_LABELS[settings.cityQuality],
    description: "Fast uses full models nearby, reduced GLBs to 500 m and a skyline farther away. Balanced extends models to 750 m. Original enables the full asset.",
    action: (direction = 1) => settings.update({ cityQuality: CITY_QUALITIES[(CITY_QUALITIES.indexOf(settings.cityQuality) + direction + CITY_QUALITIES.length) % CITY_QUALITIES.length] }) };
}
export function cityPerformanceControl(settings: ReturnType<typeof useRenderSettingsStore.getState>): MenuRow {
  return { id: "city-performance", label: "Apply mobile performance preset", adjustable: false,
    description: "Nearby models, a simpler skyline, distance fog and expensive effects off. Keeps your input and HUD choices.",
    action: () => settings.cityPerformancePreset() };
}
