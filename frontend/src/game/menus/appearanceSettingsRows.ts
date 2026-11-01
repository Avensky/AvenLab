import type { MenuRow } from "../../components/menus/TabbedMenu";
import { UI_THEMES, type UITheme } from "../../theme/catalog";
import { COSMETIC_BUNDLES, type CosmeticBundle, type VehicleCosmetics } from "../../vehicles/cosmetics/catalog";
import type { Preferences, PreferenceUpdate } from "../../store/preferences/preferencesStore";
const cycle = <T,>(values: readonly T[], value: T, dir = 1) => values[(Math.max(0,values.indexOf(value))+dir+values.length)%values.length];
/** Global readable UI is free. Local cosmetic previews never grant ownership. */
export function appearanceSettingsRows(prefs: Preferences, update: (patch: PreferenceUpdate) => void): MenuRow[] {
  const cosmetics = prefs.vehicleCosmetics;
  return [
    {id:"theme",label:"Global app theme",value:UI_THEMES[prefs.theme].label,
      description:"One palette for every menu, HUD, world editor and garage. Always available.",
      action:dir=>update({theme:cycle(Object.keys(UI_THEMES) as UITheme[],prefs.theme,dir)})},
    {id:"cosmetic-bundle",label:"Vehicle color preview",value:COSMETIC_BUNDLES[cosmetics.bundle].label,
      description:"Factory, app-matched paint or white/red concept. Local showroom preview; stripes and seat stitching await asset masks.",
      action:dir=>update({vehicleCosmetics:{bundle:cycle(Object.keys(COSMETIC_BUNDLES) as CosmeticBundle[],cosmetics.bundle,dir)}})},
    {id:"appearance-paint",label:"Individual body paint",value:prefs.garageEffects.paint.replaceAll("-"," "),
      description:"Factory or pink body preview. Editing this returns the color bundle to Factory.",
      action:dir=>update({vehicleCosmetics:{bundle:"factory"},garageEffects:{paint:cycle(["factory","hot-pink","pastel-pink"] as const,prefs.garageEffects.paint,dir)}})},
    {id:"cosmetic-finish",label:"Shared vehicle highlight finish",value:cosmetics.finish === "frs" ? "FR-S reference" : cosmetics.finish,
      description:"Same body finish across showroom vehicles. Factory keeps authored roughness; Soft uses the custom softness value below.",
      action:dir=>update({vehicleCosmetics:{finish:cycle<VehicleCosmetics["finish"]>(["factory","frs","soft"],cosmetics.finish,dir)}})},
    {id:"appearance-softness",label:"Custom highlight softness",value:`${Math.round(prefs.garageEffects.paintSoftness*100)}%`,
      description:"Editing this selects the Soft finish. Lower values produce sharper reflections.",
      action:dir=>update({vehicleCosmetics:{finish:"soft"},garageEffects:{paintSoftness:cycle([0,.25,.45,.65,.85,1],prefs.garageEffects.paintSoftness,dir)}})},
    {id:"cosmetic-cockpit",label:"Match cockpit & steering accents",value:cosmetics.matchCockpit ? "On" : "Off",
      description:"Match steering-wheel stitching and cockpit accent color to your selected appearance.",
      action:()=>update({vehicleCosmetics:{matchCockpit:!cosmetics.matchCockpit}})},
    {id:"cosmetic-slots",label:"Stripes, seats & stitching",value:"Asset work pending",disabled:true,
      description:"Camaro red stripes and FR-S black seats/red stitching are planned; detailed material work is still needed."},
  ];
}
