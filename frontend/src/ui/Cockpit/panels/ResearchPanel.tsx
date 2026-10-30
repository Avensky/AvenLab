import { ResearchControls } from "../ResearchControls";
import { HudVisibilityPanel } from "./HudVisibilityPanel";
import { COCKPIT_TABS } from "./tabs";
import { useUIStore } from "../../../store/menus/uiStore";

/** Research is an index of canonical cockpit pages plus CAN instrumentation.
 * The tab catalog supplies every shortcut; no second light/assist/washer or
 * visibility control can drift out of sync with its owning page. */
export function ResearchPanel() {
  return (
    <div className="cockpit-research-page">
      <nav className="research-shortcuts" aria-label="Cockpit shortcuts">
        {COCKPIT_TABS.filter((item) => item.id !== "research").map((item) => (
          <button
            type="button"
            key={item.id}
            aria-label={`Open ${item.label.toLowerCase()} controls`}
            onClick={() => useUIStore.getState().setCockpitTab(item.id)}
          >
            {item.label}
            <span aria-hidden="true">→</span>
          </button>
        ))}
        <HudVisibilityPanel />
      </nav>
      <fieldset className="research-instrumentation">
        <legend>CAN TOOLS</legend>
        <ResearchControls />
      </fieldset>
    </div>
  );
}
