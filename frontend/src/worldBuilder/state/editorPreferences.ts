import { create } from "zustand";
import { persist } from "zustand/middleware";
import { usePreferencesStore } from "../../store/preferences";
import { UI_THEMES } from "../../theme/catalog";
import type { DetailPreference } from "../vehicles/vehicleCatalog";
export type EditorTheme = keyof typeof EDITOR_THEMES | "shared";
export const EDITOR_THEMES = {
  ...UI_THEMES,
  navy: {
    label: "Dark navy",
    background: "#050c18",
    panel: "#0b1729",
    raised: "#10233a",
    line: "#719bd532",
    text: "#e6efff",
    muted: "#94a9c5",
    accent: "#75acff",
    physical: "#4de0b0",
    grid: "#1b3652",
    axis: "#547cac",
    floor: "#10213a",
  },
  "hacker-blue": {
    label: "Hacker blue",
    background: "#04151d",
    panel: "#092531",
    raised: "#0c3542",
    line: "#3ccdeb35",
    text: "#d8f6ff",
    muted: "#82bacb",
    accent: "#30d5ff",
    physical: "#39eea6",
    grid: "#19485a",
    axis: "#38a8ba",
    floor: "#0d3040",
  },
  forest: {
    label: "Forest",
    background: "#101c16",
    panel: "#1a2e24",
    raised: "#233f30",
    line: "#b5d39c30",
    text: "#e7edda",
    muted: "#a2b59a",
    accent: "#b8d49e",
    physical: "#65dfb0",
    grid: "#304c39",
    axis: "#8ba879",
    floor: "#23382b",
  },
} as const;
type Preferences = {
  inspector: "open" | "compact" | "hidden";
  setInspector: (mode: "open" | "compact" | "hidden") => void;
  detail: DetailPreference;
  setDetail: (detail: DetailPreference) => void;
  theme: EditorTheme;
  chunkGuide: boolean;
  setTheme: (theme: EditorTheme) => void;
  setChunkGuide: (value: boolean) => void;
};
export const useEditorPreferences = create<Preferences>()(
  persist(
    (set) => ({
      inspector: "open",
      setInspector: (inspector) => {
        if (["open", "compact", "hidden"].includes(inspector))
          set({ inspector });
      },
      detail: "auto",
      setDetail: (detail) => {
        if (["auto", "low", "high"].includes(detail)) set({ detail });
      },
      theme: "shared",
      chunkGuide: false,
      setTheme: (theme) => {
        if (theme === "shared" || Object.hasOwn(EDITOR_THEMES, theme))
          set({ theme });
      },
      setChunkGuide: (chunkGuide) => set({ chunkGuide }),
    }),
    {
      name: "avenlab-world-editor-preferences-v1",
      partialize: (s) => ({
        inspector: s.inspector,
        theme: s.theme,
        chunkGuide: s.chunkGuide,
        detail: s.detail,
      }),
      merge: (stored, current) => {
        const value = stored as Partial<Preferences> | null;
        return {
          ...current,
          ...(value?.inspector &&
          ["open", "compact", "hidden"].includes(value.inspector)
            ? { inspector: value.inspector }
            : {}),
          ...(value?.detail && ["auto", "low", "high"].includes(value.detail)
            ? { detail: value.detail }
            : {}),
          ...(value?.theme &&
          (value.theme === "shared" ||
            Object.hasOwn(EDITOR_THEMES, value.theme))
            ? { theme: value.theme }
            : {}),
          ...(typeof value?.chunkGuide === "boolean"
            ? { chunkGuide: value.chunkGuide }
            : {}),
        };
      },
    },
  ),
);

/** Shared style follows Settings; an explicit editor style stays local to authoring. */
export function useEditorPalette() {
  const theme = useEditorPreferences((s) => s.theme),
    appTheme = usePreferencesStore((s) => s.theme),
    contrast = usePreferencesStore((s) => s.highContrast);
  const palette = EDITOR_THEMES[theme === "shared" ? appTheme : theme];
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
      }
    : palette;
}
