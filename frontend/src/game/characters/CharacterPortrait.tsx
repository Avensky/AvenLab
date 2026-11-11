import { Suspense, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import type { Object3D } from "three";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { bakeCharacterPortrait, type PortraitOutfit } from "./bakeCharacterPortrait";
import { FITTING_BODY_URL } from "./standaloneCorset";
import { getWardrobeGarment, wardrobeGarmentModelUrl } from "./wardrobeGarments";
import { villagerModelUrl } from "./villagerModel";
import { VILLAGER_ID, characterLook, type CharacterChoice, type CharacterLook } from "./characterCatalog";
import "./characters.css";

const faces: Record<string, { neck: string; shadow: string; art: ReactNode }> = {
  "jules-okafor": {
    neck: "#95553d", shadow: "#65372f",
    art: <>
      <path fill="var(--portrait-hair, #1c1923)" d="M68 88c-7-9-5-24 2-29-4-11 2-20 12-21 1-11 16-18 25-13 8-12 23-10 30-4 10-5 21 2 23 11 13 1 22 14 16 24 7 7 6 22-3 31l-7 25-83 5Z" />
      <path fill="#56343b" d="M79 62c15-23 53-34 84-18l-2 9c-32-10-58 1-74 20Zm4-18c15-16 49-23 69-13l-3 5c-25-3-45 3-61 13Z" />
      <path fill="var(--portrait-skin, #95553d)" d="M80 81c-9-3-13 4-9 15 2 7 7 11 13 10l8 24 24 18 30-7 19-21 7-38-15-21-27-6-36 9Z" />
      <path fill="var(--portrait-skin-lit, #bd7b56)" d="M84 82c19-14 50-19 72-16l8 24-10 32-16 13-23 4-19-14-8-23Z" />
      <path fill="#784533" d="m127 88-8 21 13 5 8-6-6-1Zm-29 27 9 8-8-2Z" />
      <path d="M91 85q12-5 21-1m25-3q12-4 20 0" fill="none" stroke="#31202a" strokeWidth="4" strokeLinecap="round" />
      <path d="M94 92q8-3 15 0m30-3q7-4 14-1" fill="none" stroke="#33222a" strokeWidth="2.4" strokeLinecap="round" />
      <path fill="#38272a" d="m92 113 10 11 16 4 9-7 17-2 9 4 11-13-5 16-14 16-22 8-22-11Z" />
      <path d="M119 126q11 2 21-4" fill="none" stroke="#e3a17f" strokeWidth="2" strokeLinecap="round" />
      <path fill="var(--portrait-hair, #2d222c)" d="M80 81c7-22 37-31 79-25l10 13c-27-8-56-3-77 8l-5 18Z" />
      <circle cx="78" cy="104" r="3" fill="#e9c887" />
    </>,
  },
  "niko-park": {
    neck: "#cd9178", shadow: "#9e5f52",
    art: <>
      <path fill="var(--portrait-hair, #252838)" d="M69 104c-10-27-9-49 8-65 17-18 58-23 77-11 21 12 29 30 24 55l-12 43-15-3-57 15Z" />
      <path fill="#42485c" d="M74 48c17-20 55-28 78-16 15 7 23 18 26 29-15-18-38-25-63-23-16 2-30 8-41 17Z" />
      <path fill="var(--portrait-skin, #cf9077)" d="M79 91c-10-10-14-4-12 6 2 8 8 14 14 12l12 19 25 20 26-7 18-21 7-30-9-35-40-7-32 19Z" />
      <path fill="var(--portrait-skin-lit, #e6b099)" d="M84 90c14-4 31-16 44-33l24 6 9 29-8 27-15 17-20 8-19-16-10-20Z" />
      <path fill="#af7065" d="m127 94-7 18 10 3 5-4-7-2Zm-16 28 16 1 12-5-8 9-9 2Z" />
      <path d="M94 90q10-5 19-2m20-4q10-5 19-3" fill="none" stroke="#39303b" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M96 97q8-4 15-2m24-4q8-4 15-3m-39 36q11 2 21-3" fill="none" stroke="#503239" strokeWidth="2" strokeLinecap="round" />
      <path fill="var(--portrait-hair, #272a3b)" d="M67 77c6-20 24-36 51-39 24-3 46 4 55 25l-6 27-7-13-8-20c-17 9-30 20-53 26l-15 8-3 11Z" />
      <path d="M78 71c15-14 36-23 60-23" fill="none" stroke="#545d73" strokeWidth="3" strokeLinecap="round" />
      <path d="M77 107v7m5-6v4" stroke="#c8d8dd" strokeWidth="2.4" strokeLinecap="round" />
    </>,
  },
};

type PortraitProps = { look: CharacterLook; fallback: ReactNode; pending?: ReactNode; label?: string };

function schedulePortraitWork(work: () => void, delay: number) {
  let idle: number | undefined;
  const timer = window.setTimeout(() => {
    if (window.requestIdleCallback) idle = window.requestIdleCallback(work, { timeout: 1200 });
    else work();
  }, delay);
  return () => {
    window.clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
  };
}

function ModelPortrait({ source, outfit, look, fallback, pending = fallback, label }: PortraitProps & { source?: Object3D; outfit?: PortraitOutfit }) {
  const key = JSON.stringify([Boolean(source), outfit?.garment.item.id, look.character.id, look.outfit.id, look.appearance, look.wardrobe]);
  const [portrait, setPortrait] = useState<{ key: string; image: string | null; characterId: string }>();
  useEffect(() => {
    return schedulePortraitWork(() => {
      try {
        setPortrait({ key, image: bakeCharacterPortrait(look, key, source, outfit), characterId: look.character.id });
      } catch {
        setPortrait({ key, image: null, characterId: look.character.id });
      }
    }, 160);
  }, [key, look, source, outfit]);
  if (portrait?.key !== key && (!portrait?.image || portrait.characterId !== look.character.id)) return pending;
  return portrait?.image
    ? <img className="character-portrait character-portrait--model" src={portrait.image} alt={label ?? ""} />
    : fallback;
}

function OutfitPortrait({ source, url, item, ...props }: PortraitProps & {
  source: Object3D; url: string; item: NonNullable<ReturnType<typeof getWardrobeGarment>>;
}) {
  const [{ scene: garment }, { scene: body }] = useGLTF([url, FITTING_BODY_URL]);
  const outfit = useMemo(() => ({ garment: { item, scene: garment }, body: body.getObjectByName("BODY_WARDROBE") }), [item, garment, body]);
  return <ModelPortrait {...props} source={source} outfit={outfit} />;
}

function VillagerPortrait({ url, ...props }: PortraitProps & { url: string }) {
  const { scene } = useGLTF(url);
  const item = getWardrobeGarment(props.look.garments?.dress);
  const outfitUrl = item?.outfit && wardrobeGarmentModelUrl(item, "portrait");
  const stock = <ModelPortrait {...props} source={scene} />;
  return item && outfitUrl ? <AssetBoundary key={outfitUrl} fallback={stock}>
    <OutfitPortrait {...props} source={scene} item={item} url={outfitUrl} />
  </AssetBoundary> : stock;
}

/** Garage portraits use the selected GLB appearance, with art for unavailable models. */
export function CharacterPortrait({ choice, compact = false, label }: {
  choice: CharacterChoice | null | undefined;
  compact?: boolean;
  label?: string;
}) {
  const { id, outfit, appearance, wardrobe } = choice ?? {};
  const look = useMemo(() => characterLook(id && outfit ? { id, outfit, appearance, wardrobe } : null), [id, outfit, appearance, wardrobe]);
  const canBake = typeof WebGL2RenderingContext !== "undefined";
  const url = canBake && look ? villagerModelUrl(look, "portrait") : null;
  const [requestedUrl, setRequestedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    return schedulePortraitWork(() => {
      // Start the shared GLTF request after commit. Its loading manager
      // notifies the mode loading screen as soon as a request starts.
      useGLTF.preload(url);
      setRequestedUrl(url);
    }, 320);
  }, [url]);
  const originalOnly = id === VILLAGER_ID;
  const face = look && faces[look.character.id];
  const alternate = look?.outfit.id === look?.character.outfits[1]?.id;
  const palette = look && {
    ...(look.appearance.skin !== "original" && {
      "--portrait-skin": look.skin, "--portrait-skin-lit": `color-mix(in srgb, ${look.skin} 75%, white)`,
    }),
    ...(look.appearance.hair_color !== "original" && { "--portrait-hair": look.hair }),
  } as CSSProperties;
  const fallback = originalOnly
    ? <span className="character-portrait character-portrait--unavailable" role={label ? "img" : undefined}
        aria-label={label} aria-hidden={label ? undefined : true} />
    : <svg className="character-portrait" style={palette ?? undefined} viewBox={compact ? "56 16 128 128" : "0 0 240 260"}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path fill="var(--app-background, #161c26)" d="M0 0h240v260H0z" />
      <path fill="var(--app-raised, #283748)" d="M240 0v260H27L149 0Z" />
      <path fill="none" stroke="var(--app-accent, #88cbd6)" opacity=".36" d="M240 88 155 260M216 0 95 260M0 52h63m-63 9h27" />
      {face && look ? <>
        <path fill="#131825" d="M19 260c3-37 8-65 19-77 10-12 37-17 58-25h45c23 7 49 12 61 26 13 15 17 42 20 76Z" />
        <path fill={look.appearance.skin === "original" ? face.neck : look.skin} d="m99 120 43 2 2 33 12 11-31 30-36-30 9-12Z" />
        <path fill={face.shadow} d="m99 127 43 4 1 20-27 17-18-12Z" />
        <path fill={look.fabric} d="M18 260c4-33 8-63 22-76 10-9 30-13 51-22l30 29 30-29c22 8 42 12 52 23 13 13 18 45 20 75h-72l-26-53-25 53Z" />
        <path fill="#161b29" opacity=".56" d="m89 157 32 34-30 7-13-27Zm63 0 14 12-12 30-33-8Z" />
        <path fill="none" stroke={look.trim} strokeWidth="2" d="m88 164 33 29 30-29m-29 29 1 67M44 193l-7 67m162-67 7 67" />
        {alternate
          ? <path fill={look.trim} d="m33 208 39-16 5 7-46 18Zm174 0-39-16-5 7 46 18Z" />
          : <path fill={look.trim} d="M53 216h24v6H53zM169 216h14v8h-14z" />}
        {face.art}
        {look.appearance.headwear === "hat" && <g fill={look.fabric} stroke={look.trim} strokeWidth="2">
          <path d={look.female ? "M78 51Q81 26 117 25q32 0 42 27l-8 11H84Z" : "M72 69q1-40 48-39 38 1 47 35l-36 9Z"} />
          <path d={look.female ? "M58 59q52-18 124-3l-16 12-89 6Z" : "M111 67q42-13 73-1l-19 12-51-2Z"} />
        </g>}
      </> : <path fill="var(--app-muted, #889aa9)" opacity=".64" d="M120 42a28 28 0 1 0 0 56 28 28 0 0 0 0-56Zm-54 83c10-16 32-22 54-22s44 6 54 22l14 57H52Z" />}
    </svg>;
  if (!look || !canBake) return fallback;
  const unavailable = originalOnly ? fallback : <ModelPortrait look={look} fallback={fallback} label={label} />;
  const loading = <span className="character-portrait character-portrait--loading" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
  return url && requestedUrl !== url ? loading : url ? (
    <AssetBoundary key={url} fallback={unavailable}>
      <Suspense fallback={loading}><VillagerPortrait url={url} look={look} fallback={fallback} pending={loading} label={label} /></Suspense>
    </AssetBoundary>
  ) : unavailable;
}
