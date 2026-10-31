import {
  usePreferencesStore,
  type HudGroupId,
} from "../../../store/preferences";

/** Page-local shortcut to the same saved switch used by Settings → HUD.
 * Hiding a widget never sends vehicle commands or changes radio playback. */
export function HudVisibilityToggle({
  id,
  label,
}: {
  id: HudGroupId;
  label: string;
}) {
  const visible = usePreferencesStore((s) => s.hudGroups[id]);
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={visible}
      onClick={() => {
        const preferences = usePreferencesStore.getState();
        preferences.setHudGroup(id, !preferences.hudGroups[id]);
      }}
    >
      {visible ? "HIDE HUD" : "SHOW HUD"}
    </button>
  );
}
