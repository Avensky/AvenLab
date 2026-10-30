import { useEffect } from "react";
import { usePreferencesStore } from "../store/preferences";
import { applyUITheme } from "./catalog";
import "./theme.css";
/** Mount once at the app/preview root. Accessibility follows the same persisted
 * owner on every screen; standalone previews do not invent their own palette. */
export function useAppTheme() {
  const theme = usePreferencesStore((s) => s.theme),
    motion = usePreferencesStore((s) => s.reducedMotion),
    contrast = usePreferencesStore((s) => s.highContrast),
    scale = usePreferencesStore((s) => s.menuTextScale);
  useEffect(() => {
    applyUITheme(theme);
    const root = document.documentElement;
    root.dataset.reduceMotion = String(motion);
    root.dataset.highContrast = String(contrast);
    root.style.setProperty("--menu-text-scale", String(scale));
  }, [theme, motion, contrast, scale]);
}
