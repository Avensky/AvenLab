import { ResearchControls } from "../ResearchControls";
import { HudVisibilityPanel } from "./HudVisibilityPanel";

/** Layout preferences and actual electronics have separate owners. This page
 * keeps all electronics available even when their driving widgets are hidden. */
export function ResearchPanel() {
  return (
    <div className="cockpit-research-page">
      <HudVisibilityPanel />
      <ResearchControls />
    </div>
  );
}
