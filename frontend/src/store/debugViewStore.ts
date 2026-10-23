import { create } from "zustand";

export type DebugPlayerScope = "local" | "all";

type DebugViewState = {
    // This is a rendering experiment; it never changes input or backend physics.
    interpolationEnabled: boolean;
    setInterpolationEnabled: (enabled: boolean) => void;
    toggleInterpolation: () => void;
    playerScope: DebugPlayerScope;
    setPlayerScope: (scope: DebugPlayerScope) => void;
    togglePlayerScope: () => void;
};

export const useDebugViewStore = create<DebugViewState>((set) => ({
    interpolationEnabled: false,
    setInterpolationEnabled: (interpolationEnabled) => set({ interpolationEnabled }),
    toggleInterpolation: () => set((state) => ({ interpolationEnabled: !state.interpolationEnabled })),
    playerScope: "local",

    setPlayerScope: (playerScope) => {
        set({ playerScope });
    },

    togglePlayerScope: () => {
        set((state) => ({
            playerScope:
                state.playerScope === "local"
                    ? "all"
                    : "local",
        }));
    },
}));
