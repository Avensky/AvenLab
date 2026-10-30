import {
  usePreferencesStore,
  HUD_GROUP_LABELS,
  RESEARCH_HUD_GROUPS,
  type HudGroupId,
} from "../../../store/preferences/index";

/** Research is the quick layout workbench. These switches share the Settings
 * store; hiding a widget never sends a vehicle command or changes its system. */
export function HudVisibilityPanel() {
  const groups = usePreferencesStore((s) => s.hudGroups),
    policy = usePreferencesStore((s) => s.ignitionVisibility);
  const toggle = (id: HudGroupId, visible: boolean) => {
    const prefs = usePreferencesStore.getState();
    prefs.setHudGroup(id, visible);
    // Restore a key hidden by the separate driving-fade policy as well.
    if (id === "ignition" && visible && prefs.ignitionVisibility === "hidden")
      prefs.update({ ignitionVisibility: "auto" });
  };
  return (
    <fieldset className="research-hud-visibility">
      <legend>DRIVING HUD</legend>
      <p>Hide or restore controls on the driving screen.</p>
      <div>
        {RESEARCH_HUD_GROUPS.map((id) => {
          const shown =
            groups[id] && (id !== "ignition" || policy !== "hidden");
          return (
            <button
              type="button"
              role="switch"
              key={id}
              aria-label={HUD_GROUP_LABELS[id]}
              aria-checked={shown}
              onClick={() => toggle(id, !shown)}
            >
              <span>{HUD_GROUP_LABELS[id]}</span>
              <b>{shown ? "SHOW" : "HIDE"}</b>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
