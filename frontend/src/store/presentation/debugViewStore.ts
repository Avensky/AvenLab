import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type DebugPlayerScope = "local" | "all";

type DebugViewState = {
  // Smooth received poses; this never changes input or backend physics.
  interpolationEnabled: boolean;
  setInterpolationEnabled: (enabled: boolean) => void;
  toggleInterpolation: () => void;
  playerScope: DebugPlayerScope;
  setPlayerScope: (scope: DebugPlayerScope) => void;
  togglePlayerScope: () => void;
};

export const useDebugViewStore = create<DebugViewState>()(
  persist(
    (set) => ({
      interpolationEnabled: true,
      setInterpolationEnabled: (interpolationEnabled) =>
        set({ interpolationEnabled }),
      toggleInterpolation: () =>
        set((state) => ({ interpolationEnabled: !state.interpolationEnabled })),
      playerScope: "local",

      setPlayerScope: (playerScope) => {
        set({ playerScope });
      },

      togglePlayerScope: () => {
        set((state) => ({
          playerScope: state.playerScope === "local" ? "all" : "local",
        }));
      },
    }),
    {
      name: "avenlab-debug-view-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ interpolationEnabled }) => ({ interpolationEnabled }),
      merge: (persisted, current) => {
        const data =
          persisted && typeof persisted === "object"
            ? (persisted as Partial<DebugViewState>)
            : {};
        return {
          ...current,
          interpolationEnabled:
            typeof data.interpolationEnabled === "boolean"
              ? data.interpolationEnabled
              : true,
        };
      },
    },
  ),
);
