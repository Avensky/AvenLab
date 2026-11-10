import type { ReactNode } from "react";
import { characterLook, type CharacterChoice } from "./characterCatalog";
import "./characters.css";

const faces: Record<string, { neck: string; shadow: string; art: ReactNode }> = {
  "mara-vega": {
    neck: "#bd7955", shadow: "#8e4b3e",
    art: <>
      <path fill="#251b25" d="M80 117C67 110 62 97 65 78 58 67 65 51 76 47c-5-14 4-27 16-29 10-2 20 3 24 11 36-4 60 17 62 47 1 24-6 40-25 60l-66-7Z" />
      <path fill="#49303a" d="M76 47c7-10 23-12 40-18 29-1 51 12 58 34-14-16-30-19-46-20-19 0-39 6-52 20Z" />
      <path fill="#bd7955" d="M84 89c-10-9-16-2-13 9 1 9 8 13 14 12l9 20 32 18 29-19c7-8 13-27 10-48-6-7-10-15-11-24-14 16-37 25-67 24Z" />
      <path fill="#dc996d" d="M87 81c26-3 47-11 64-21l6 25-8 34-20 25-16-4-20-20Z" />
      <path fill="#ab5e4c" d="m125 94-6 19 11 2 2-6Zm-31 15 11 4-6 7-6-7Z" />
      <path d="M94 92q10-7 20-2m18-3q10-6 18-1" fill="none" stroke="#3a2529" strokeWidth="3" strokeLinecap="round" />
      <path d="M97 98q8-5 15-1m22-3q8-4 14-1m-34 33q11 4 20-3" fill="none" stroke="#39232a" strokeWidth="2.2" strokeLinecap="round" />
      <path fill="#35232d" d="M73 69c10-14 35-23 67-25l16 10c-13 14-36 22-66 28l-2 18-8-8Z" />
      <path d="M79 111c-5 0-7 8-2 11s9-4 7-9" fill="none" stroke="#f7cc8d" strokeWidth="2.4" />
      <path fill="#98604d" d="M103 108h2v2h-2zm4-2h2v2h-2zm4 1h2v2h-2z" />
    </>,
  },
  "jules-okafor": {
    neck: "#95553d", shadow: "#65372f",
    art: <>
      <path fill="#1c1923" d="M68 88c-7-9-5-24 2-29-4-11 2-20 12-21 1-11 16-18 25-13 8-12 23-10 30-4 10-5 21 2 23 11 13 1 22 14 16 24 7 7 6 22-3 31l-7 25-83 5Z" />
      <path fill="#56343b" d="M79 62c15-23 53-34 84-18l-2 9c-32-10-58 1-74 20Zm4-18c15-16 49-23 69-13l-3 5c-25-3-45 3-61 13Z" />
      <path fill="#95553d" d="M80 81c-9-3-13 4-9 15 2 7 7 11 13 10l8 24 24 18 30-7 19-21 7-38-15-21-27-6-36 9Z" />
      <path fill="#bd7b56" d="M84 82c19-14 50-19 72-16l8 24-10 32-16 13-23 4-19-14-8-23Z" />
      <path fill="#784533" d="m127 88-8 21 13 5 8-6-6-1Zm-29 27 9 8-8-2Z" />
      <path d="M91 85q12-5 21-1m25-3q12-4 20 0" fill="none" stroke="#31202a" strokeWidth="4" strokeLinecap="round" />
      <path d="M94 92q8-3 15 0m30-3q7-4 14-1" fill="none" stroke="#33222a" strokeWidth="2.4" strokeLinecap="round" />
      <path fill="#38272a" d="m92 113 10 11 16 4 9-7 17-2 9 4 11-13-5 16-14 16-22 8-22-11Z" />
      <path d="M119 126q11 2 21-4" fill="none" stroke="#e3a17f" strokeWidth="2" strokeLinecap="round" />
      <path fill="#2d222c" d="M80 81c7-22 37-31 79-25l10 13c-27-8-56-3-77 8l-5 18Z" />
      <circle cx="78" cy="104" r="3" fill="#e9c887" />
    </>,
  },
  "niko-park": {
    neck: "#cd9178", shadow: "#9e5f52",
    art: <>
      <path fill="#252838" d="M69 104c-10-27-9-49 8-65 17-18 58-23 77-11 21 12 29 30 24 55l-12 43-15-3-57 15Z" />
      <path fill="#42485c" d="M74 48c17-20 55-28 78-16 15 7 23 18 26 29-15-18-38-25-63-23-16 2-30 8-41 17Z" />
      <path fill="#cf9077" d="M79 91c-10-10-14-4-12 6 2 8 8 14 14 12l12 19 25 20 26-7 18-21 7-30-9-35-40-7-32 19Z" />
      <path fill="#e6b099" d="M84 90c14-4 31-16 44-33l24 6 9 29-8 27-15 17-20 8-19-16-10-20Z" />
      <path fill="#af7065" d="m127 94-7 18 10 3 5-4-7-2Zm-16 28 16 1 12-5-8 9-9 2Z" />
      <path d="M94 90q10-5 19-2m20-4q10-5 19-3" fill="none" stroke="#39303b" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M96 97q8-4 15-2m24-4q8-4 15-3m-39 36q11 2 21-3" fill="none" stroke="#503239" strokeWidth="2" strokeLinecap="round" />
      <path fill="#272a3b" d="M67 77c6-20 24-36 51-39 24-3 46 4 55 25l-6 27-7-13-8-20c-17 9-30 20-53 26l-15 8-3 11Z" />
      <path d="M78 71c15-14 36-23 60-23" fill="none" stroke="#545d73" strokeWidth="3" strokeLinecap="round" />
      <path d="M77 107v7m5-6v4" stroke="#c8d8dd" strokeWidth="2.4" strokeLinecap="round" />
    </>,
  },
};

/** Static illustrated portraits share one crop for the roster and player cards. */
export function CharacterPortrait({ choice, compact = false, label }: {
  choice: CharacterChoice | null | undefined;
  compact?: boolean;
  label?: string;
}) {
  const look = characterLook(choice);
  const face = look && faces[look.character.id];
  const alternate = look?.outfit.id === look?.character.outfits[1]?.id;
  return (
    <svg className="character-portrait" viewBox={compact ? "56 16 128 128" : "0 0 240 260"}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path fill="var(--app-background, #161c26)" d="M0 0h240v260H0z" />
      <path fill="var(--app-raised, #283748)" d="M240 0v260H27L149 0Z" />
      <path fill="none" stroke="var(--app-accent, #88cbd6)" opacity=".36" d="M240 88 155 260M216 0 95 260M0 52h63m-63 9h27" />
      {face && look ? <>
        <path fill="#131825" d="M19 260c3-37 8-65 19-77 10-12 37-17 58-25h45c23 7 49 12 61 26 13 15 17 42 20 76Z" />
        <path fill={face.neck} d="m99 120 43 2 2 33 12 11-31 30-36-30 9-12Z" />
        <path fill={face.shadow} d="m99 127 43 4 1 20-27 17-18-12Z" />
        <path fill={look.outfit.jacket} d="M18 260c4-33 8-63 22-76 10-9 30-13 51-22l30 29 30-29c22 8 42 12 52 23 13 13 18 45 20 75h-72l-26-53-25 53Z" />
        <path fill="#161b29" opacity=".56" d="m89 157 32 34-30 7-13-27Zm63 0 14 12-12 30-33-8Z" />
        <path fill="none" stroke={look.outfit.trim} strokeWidth="2" d="m88 164 33 29 30-29m-29 29 1 67M44 193l-7 67m162-67 7 67" />
        {alternate
          ? <path fill={look.outfit.trim} d="m33 208 39-16 5 7-46 18Zm174 0-39-16-5 7 46 18Z" />
          : <path fill={look.outfit.trim} d="M53 216h24v6H53zM169 216h14v8h-14z" />}
        {face.art}
      </> : <path fill="var(--app-muted, #889aa9)" opacity=".64" d="M120 42a28 28 0 1 0 0 56 28 28 0 0 0 0-56Zm-54 83c10-16 32-22 54-22s44 6 54 22l14 57H52Z" />}
    </svg>
  );
}
