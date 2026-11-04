import { useNetworkStore } from "../store/session/networkStore";
import { useHeroLoadouts } from "../vehicles/cosmetics/heroLoadouts";
import { useEffect } from "react";
import { usePreferencesStore } from "../store/preferences";
import { applyUITheme } from "./catalog";
import { useMatchTeamTheme } from "./useMatchTeamTheme";
import "./theme.css";
/** Mount once at the app/preview root. Accessibility follows the same persisted
 * owner on every screen; standalone previews do not invent their own palette. */
export function useAppTheme() {
  const theme = usePreferencesStore((s) => s.theme),
    motion = usePreferencesStore((s) => s.reducedMotion),
    contrast = usePreferencesStore((s) => s.highContrast),
    scale = usePreferencesStore((s) => s.menuTextScale),
    cosmetics = usePreferencesStore((s) => s.vehicleCosmetics);
  const body=useNetworkStore(s=>s.getMe()?.appearance?.body);
  const savedBody=useHeroLoadouts(s=>s.loadouts[s.defaultHero === "mechanic" ? "brz" : s.defaultHero === "logistics" ? "ae86" : s.defaultHero]?.body);
  useEffect(() => {
    applyUITheme(theme);
    const root = document.documentElement;
    const chosen=body??savedBody;
    const accent = chosen && chosen !== "factory" ? chosen : null;
    root.style.setProperty("--vehicle-accent", cosmetics.matchCockpit ? (accent && accent !== "theme" ? accent : "var(--app-accent)") : "#a13c3d");
    root.dataset.matchCockpit = String(cosmetics.matchCockpit);
    root.dataset.reduceMotion = String(motion);
    root.dataset.highContrast = String(contrast);
    root.style.setProperty("--menu-text-scale", String(scale));
  }, [theme, motion, contrast, scale, cosmetics, body, savedBody]);
  useMatchTeamTheme();
}
