import { memo, useEffect, useState, type CSSProperties } from "react";
import { HEROES } from "../../store/alpha/alphaStore";
import { FACTORY_APPEARANCE, useHeroLoadouts, type HeroAppearance } from "../../vehicles/cosmetics/heroLoadouts";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";
import { getStyledPortrait, needsStyledPortrait, portraitStyleKey } from "./heroPortraitCache";

export const HeroPortrait = memo(function HeroPortrait({ hero, className = "", appearance }: {
  hero: string | null;
  className?: string;
  /** Undefined uses this player's style; null is an unknown peer's factory. */
  appearance?: HeroAppearance | null;
}) {
  const item = HEROES.find(item => item.id === hero);
  const saved = useHeroLoadouts(s => item ? (s.draft?.vehicle === item.vehicle ? s.draft.appearance : s.loadouts[item.vehicle]) : undefined);
  const style = appearance === undefined ? saved ?? FACTORY_APPEARANCE : appearance ?? FACTORY_APPEARANCE;
  const model = item?.vehicle as VehicleModelId | undefined;
  const key = portraitStyleKey(model ?? "empty", style);
  const custom = Boolean(model && needsStyledPortrait(style));
  const [image, setImage] = useState<{ key: string; src: string | null }>({ key: "", src: null });
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!custom || !model) return;
    let live = true;
    // The key snapshots all style fields and rejects late work after switching.
    const selectedStyle = JSON.parse(key) as string[];
    const value: HeroAppearance = { body: selectedStyle[1], finish: selectedStyle[2] as HeroAppearance["finish"], seats: selectedStyle[3] as HeroAppearance["seats"], skin: selectedStyle[4] };
    const timer = window.setTimeout(() => {
      void getStyledPortrait(model, value).then(src => { if (live) setImage({ key, src }); }, () => { if (live) setImage({ key, src: null }); });
    }, 120);
    return () => { live = false; window.clearTimeout(timer); };
  }, [custom, key, model]);
  const ready = custom && image.key === key && image.src;
  const src = ready || (item ? `/images/heroes/${item.vehicle}.webp` : "");
  return (
    <span className={`hero-portrait-art ${className}`} data-role={item?.role} data-style={custom ? ready ? "ready" : image.key === key ? "unavailable" : "loading" : "factory"} style={{ "--portrait-paint": style.body === "factory" ? "#bac5cf" : style.body } as CSSProperties}>
      {item && src !== failedSrc ? <img src={src} width="320" height="216" alt="" decoding="async" draggable={false} onError={() => setFailedSrc(src)} /> : <span className="hero-portrait-fallback" aria-hidden="true">{item?.name.slice(0, 2) ?? "?"}</span>}
      {custom && !ready && <span className="hero-portrait-style-status"><i aria-hidden="true" />{image.key === key ? "STYLE PREVIEW UNAVAILABLE" : "LOADING SAVED STYLE"}</span>}
    </span>
  );
});
