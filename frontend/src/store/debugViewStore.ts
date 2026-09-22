import { create } from "zustand";

export type DebugPlayerScope = "local" | "all";

type DebugViewState = {
    playerScope: DebugPlayerScope;
    setPlayerScope: (scope: DebugPlayerScope) => void;
    togglePlayerScope: () => void;
};

export const useDebugViewStore = create<DebugViewState>((set) => ({
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