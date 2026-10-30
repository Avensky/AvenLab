import { usePreferencesStore } from "../store/preferences";
import { UI_THEMES, type UITheme } from "./catalog";
/** One preference controls menus, debugger, cockpit, and the editor's shared style. */
export function ThemePreferences() {
  const theme = usePreferencesStore((s) => s.theme),
    update = usePreferencesStore((s) => s.update);
  return (
    <label className="theme-choice">
      <span>Theme</span>
      <select
        aria-label="Interface theme"
        value={theme}
        onChange={(event) => update({ theme: event.target.value as UITheme })}
      >
        {Object.entries(UI_THEMES).map(([id, palette]) => (
          <option key={id} value={id}>
            {palette.label}
          </option>
        ))}
      </select>
    </label>
  );
}
