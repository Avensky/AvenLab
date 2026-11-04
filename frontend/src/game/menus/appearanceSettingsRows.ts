import type { MenuRow } from "../../components/menus/TabbedMenu";
import { UI_THEMES, type UITheme } from "../../theme/catalog";
import type { Preferences, PreferenceUpdate } from "../../store/preferences/preferencesStore";
const cycle = <T,>(values: readonly T[], value: T, dir = 1) => values[(Math.max(0,values.indexOf(value))+dir+values.length)%values.length];
/** Global readable UI is free. Local cosmetic previews never grant ownership. */
export function appearanceSettingsRows(prefs: Preferences, update: (patch: PreferenceUpdate) => void): MenuRow[] {
  const cosmetics = prefs.vehicleCosmetics;
  return [
    {id:"theme",label:"Global app theme",value:UI_THEMES[prefs.theme].label,
      description:"One palette for every menu, HUD, world editor and garage. Always available.",
      action:dir=>update({theme:cycle(Object.keys(UI_THEMES) as UITheme[],prefs.theme,dir)})},
    {id:"cosmetic-cockpit",label:"Match cockpit panel to vehicle",value:cosmetics.matchCockpit ? "On" : "Off",
      description:"Use the selected vehicle appearance for cockpit panel accents. Wheel, shift knob and parking-brake thread follow the app theme.",
      action:()=>update({vehicleCosmetics:{matchCockpit:!cosmetics.matchCockpit}})},
    {id:"hero-modifications",label:"Paint & hero loadouts",value:"Main menu → Heroes",disabled:true,
      description:"Paint presets, per-vehicle finishes and default hero selection live in Heroes."},
  ];
}
