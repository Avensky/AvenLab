import { memo, useCallback, useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { HEROES, heroForVehicle } from "../../store/alpha/alphaStore";
import { normalizeHeroAppearance, useHeroLoadouts, type HeroAppearance } from "../../vehicles/cosmetics/heroLoadouts";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";
import { getStyledPortrait, needsStyledPortrait, peekStyledPortrait, portraitStyleKey, subscribeStyledPortrait } from "./heroPortraitCache";
import { isDrivingScreen, useUIStore } from "../../store/menus/uiStore";
import { DEFAULT_WINDOW_TONE, type WindowTone } from "../preview/windowTones";

export const HeroPortrait = memo(function HeroPortrait({ hero, className = "", appearance, cacheOnly = false, showStyleStatus = true, windowTone = DEFAULT_WINDOW_TONE }: {
  hero: string | null;
  className?: string;
  /** Undefined uses this player's style; null is an unknown peer's factory. */
  appearance?: HeroAppearance | null;
  /** Reuse ready styled images or factory art; never start a GLB/GPU bake. */
  cacheOnly?: boolean;
  showStyleStatus?: boolean;
  windowTone?: WindowTone;
}) {
  // A late-joining peer may not have a styled image yet. Keep factory art until
  // a menu prepares it: a 1500ms delay still causes a GPU/GLB stall while driving.
  const driving = useUIStore(s => isDrivingScreen(s.screen));
  const deferred = cacheOnly || driving;
  const item = HEROES.find(item => item.id === hero) ?? heroForVehicle(hero);
  const saved = useHeroLoadouts(s => item ? (s.draft?.vehicle === item.vehicle ? s.draft.appearance : s.loadouts[item.vehicle]) : undefined);
  const style = normalizeHeroAppearance(appearance === undefined ? saved : appearance);
  const model = item?.vehicle as VehicleModelId | undefined;
  const key = portraitStyleKey(model ?? "empty", style, windowTone);
  const custom = Boolean(model && (needsStyledPortrait(style) || windowTone !== DEFAULT_WINDOW_TONE));
  const subscribe = useCallback((listener:()=>void)=>subscribeStyledPortrait(key,listener),[key]);
  const cached = useSyncExternalStore(subscribe,
    () => custom && model ? peekStyledPortrait(model, style, windowTone) : null, () => null);
  const [image, setImage] = useState<{ key: string; src: string | null }>({ key: "", src: null });
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  useEffect(() => {
    if (deferred || !custom || !model || cached) return;
    let live = true;
    // The key snapshots all style fields and rejects late work after switching.
    const selectedStyle = JSON.parse(key) as string[];
    const value: HeroAppearance = { body: selectedStyle[1], finish: selectedStyle[2] as HeroAppearance["finish"], seats: selectedStyle[3] as HeroAppearance["seats"], skin: selectedStyle[4], metallic: Number(selectedStyle[5]) };
    const timer = window.setTimeout(() => {
      // The store can change before React runs this effect's cleanup.
      if (!live || isDrivingScreen(useUIStore.getState().screen)) return;
      void getStyledPortrait(model, value, windowTone).then(src => { if (live) setImage({ key, src }); }, () => { if (live) setImage({ key, src: null }); });
    }, 120);
    return () => { live = false; window.clearTimeout(timer); };
  }, [deferred, custom, key, model, cached, windowTone]);
  const ready = cached || (custom && image.key === key && image.src);
  const src = ready || (item ? item.vehicle==='louisiana'?'/images/heroes/louisiana.svg':`/images/heroes/${item.vehicle}.webp` : "");
  const phase = custom ? ready ? "ready" : deferred ? "deferred" : image.key === key ? "unavailable" : "loading" : "factory";
  return (
    <span className={`hero-portrait-art ${className}`} data-role={item?.role} data-cache-only={deferred} data-style={phase} aria-busy={phase === "loading" || undefined} style={{ "--portrait-paint": style.body === "factory" ? "#bac5cf" : style.body === "theme" ? "var(--app-accent)" : style.body } as CSSProperties}>
      {item && src !== failedSrc ? <img src={src} width="320" height="216" alt="" decoding="async" draggable={false} onError={() => setFailedSrc(src)} /> : <span className="hero-portrait-fallback" aria-hidden="true">{item?.name.slice(0, 2) ?? "?"}</span>}
      {showStyleStatus && custom && !ready && <span className="hero-portrait-style-status"><i aria-hidden="true" />{deferred ? "SAVED STYLE" : phase === "unavailable" ? "STYLE PREVIEW UNAVAILABLE" : "UPDATING PORTRAIT"}</span>}
    </span>
  );
});
