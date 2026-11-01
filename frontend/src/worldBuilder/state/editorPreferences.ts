import type { CSSProperties } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { usePreferencesStore } from "../../store/preferences";
import { UI_THEMES } from "../../theme/catalog";
import type { DetailPreference } from "../vehicles/vehicleCatalog";
type Preferences = {
  libraryVisible: boolean;
  toggleLibrary: () => void;
  inspector: "open" | "compact" | "hidden";
  setInspector: (mode: "open" | "compact" | "hidden") => void;
  detail: DetailPreference;
  setDetail: (detail: DetailPreference) => void;
  chunkGuide: boolean;
  setChunkGuide: (value: boolean) => void;
};
export const useEditorPreferences = create<Preferences>()(
  persist(
    (set) => ({
      libraryVisible: true,
      toggleLibrary: () => set(s => ({libraryVisible:!s.libraryVisible})),
      inspector: "open",
      setInspector: (inspector) => {
        if (["open", "compact", "hidden"].includes(inspector))
          set({ inspector });
      },
      detail: "auto",
      setDetail: (detail) => {
        if (["auto", "low", "high"].includes(detail)) set({ detail });
      },
      chunkGuide: false,
      setChunkGuide: (chunkGuide) => set({ chunkGuide }),
    }),
    {
      name: "avenlab-world-editor-preferences-v1",
      partialize: (s) => ({
        libraryVisible: s.libraryVisible,
        inspector: s.inspector,
        chunkGuide: s.chunkGuide,
        detail: s.detail,
      }),
      merge: (stored, current) => {
        const value = stored as Partial<Preferences> | null;
        return {
          ...current,
          libraryVisible: typeof value?.libraryVisible === "boolean" ? value.libraryVisible : true,
          ...(value?.inspector &&
          ["open", "compact", "hidden"].includes(value.inspector)
            ? { inspector: value.inspector }
            : {}),
          ...(value?.detail && ["auto", "low", "high"].includes(value.detail)
            ? { detail: value.detail }
            : {}),
          ...(typeof value?.chunkGuide === "boolean"
            ? { chunkGuide: value.chunkGuide }
            : {}),
        };
      },
    },
  ),
);

/** The Settings preference is the sole palette owner. Legacy local themes
 * are deliberately ignored during hydration, preventing mixed app/editor UI. */
export function useEditorPalette() {
  const theme = usePreferencesStore((s) => s.theme),
    contrast = usePreferencesStore((s) => s.highContrast);
  const palette = UI_THEMES[theme];
  return contrast
    ? {
        ...palette,
        background: "#000000",
        panel: "#070707",
        raised: "#272727",
        text: "#ffffff",
        muted: "#eeeeee",
        line: "#cccccc",
        accent: "#ffffff",
        floor: "#111111",
        grid: "#333333",
        axis: "#aaaaaa",
      }
    : palette;
}

/** Shared by layout and collider panels so editor surfaces stay paired. */
export function editorPaletteCSS(palette: ReturnType<typeof useEditorPalette>): CSSProperties {
  return {
    "--le-bg":palette.background,"--le-panel":palette.panel,
    "--le-raised":palette.raised,"--le-line":palette.line,
    "--le-text":palette.text,"--le-muted":palette.muted,
    "--le-green":palette.accent,"--le-physical":palette.physical,
  } as CSSProperties;
}
