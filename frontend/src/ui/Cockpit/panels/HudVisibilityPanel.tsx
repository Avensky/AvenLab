import { useUIStore } from "../../../store/menus/uiStore";

/** Stable public entry for the HUD layout shortcut. Settings owns the complete
 * visibility list; Research links there rather than cloning its switches. */
export function HudVisibilityPanel() {
  return (
    <button
      type="button"
      className="research-hud-link"
      aria-label="Open HUD layout settings"
      onClick={() => useUIStore.getState().openSettings("hud")}
    >
      HUD LAYOUT <span aria-hidden="true">→</span>
    </button>
  );
}
