import { memo, useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { HEROES, heroForVehicle } from "../../store/alpha/alphaStore";
import { FACTORY_APPEARANCE, useHeroLoadouts, type HeroAppearance } from "../../vehicles/cosmetics/heroLoadouts";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";
import { getStyledPortrait, needsStyledPortrait, peekStyledPortrait, portraitStyleKey, subscribeStyledPortraits } from "./heroPortraitCache";
import { isDrivingScreen, useUIStore } from "../../store/menus/uiStore";

export const HeroPortrait = memo(function HeroPortrait({ hero, className = "", appearance, cacheOnly = false, showStyleStatus = true }: {
  hero: string | null;
  className?: string;
  /** Undefined uses this player's style; null is an unknown peer's factory. */
  appearance?: HeroAppearance | null;
  /** Driving HUDs reuse finished images; expensive custom bakes belong in menus. */
  cacheOnly?: boolean;
  showStyleStatus?: boolean;
}) {
  // Shared portraits also appear in the live Tab table, details and hero guide.
  // Guard the expensive path centrally so those callers cannot accidentally
  // create GLB/PMREM work while the world remains mounted behind an overlay.
  const driving = useUIStore(s => isDrivingScreen(s.screen));
  const deferred = cacheOnly || driving;
  const item = HEROES.find(item => item.id === hero) ?? heroForVehicle(hero);
  const saved = useHeroLoadouts(s => item ? (s.draft?.vehicle === item.vehicle ? s.draft.appearance : s.loadouts[item.vehicle]) : undefined);
  const style = appearance === undefined ? saved ?? FACTORY_APPEARANCE : appearance ?? FACTORY_APPEARANCE;
  const model = item?.vehicle as VehicleModelId | undefined;
  const key = portraitStyleKey(model ?? "empty", style);
  const custom = Boolean(model && needsStyledPortrait(style));
  const cached = useSyncExternalStore(subscribeStyledPortraits,
    () => custom && model ? peekStyledPortrait(model, style) : null, () => null);
  const [image, setImage] = useState<{ key: string; src: string | null }>({ key: "", src: null });
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  useEffect(() => {
    if (deferred || !custom || !model) return;
    let live = true;
    // The key snapshots all style fields and rejects late work after switching.
    const selectedStyle = JSON.parse(key) as string[];
    const value: HeroAppearance = { body: selectedStyle[1], finish: selectedStyle[2] as HeroAppearance["finish"], seats: selectedStyle[3] as HeroAppearance["seats"], skin: selectedStyle[4] };
    const timer = window.setTimeout(() => {
      if (isDrivingScreen(useUIStore.getState().screen)) return;
      void getStyledPortrait(model, value).then(src => { if (live) setImage({ key, src }); }, () => { if (live) setImage({ key, src: null }); });
    }, 120);
    return () => { live = false; window.clearTimeout(timer); };
  }, [deferred, custom, key, model]);
  const ready = cached || (custom && image.key === key && image.src);
  const src = ready || (item ? item.vehicle==='louisiana'?'/images/heroes/louisiana.svg':`/images/heroes/${item.vehicle}.webp` : "");
  return (
    <span className={`hero-portrait-art ${className}`} data-role={item?.role} data-cache-only={deferred} data-style={custom ? ready ? "ready" : deferred ? "deferred" : image.key === key ? "unavailable" : "loading" : "factory"} style={{ "--portrait-paint": style.body === "factory" ? "#bac5cf" : style.body === "theme" ? "var(--app-accent)" : style.body } as CSSProperties}>
      {item && src !== failedSrc ? <img src={src} width="320" height="216" alt="" decoding="async" draggable={false} onError={() => setFailedSrc(src)} /> : <span className="hero-portrait-fallback" aria-hidden="true">{item?.name.slice(0, 2) ?? "?"}</span>}
      {showStyleStatus && custom && !ready && <span className="hero-portrait-style-status"><i aria-hidden="true" />{deferred ? "SAVED STYLE" : image.key === key ? "STYLE PREVIEW UNAVAILABLE" : "LOADING SAVED STYLE"}</span>}
    </span>
  );
});
