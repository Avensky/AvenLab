// store/canDataStore.ts
import { create } from "zustand";

export type CanFrame = [
    string, // hexId
    string, // signalName
    number, // rawId
    string, // decoded
    number, // timestamp
    number, // elapsedSec
    number[], // data
    number // dlc
];

type CommandView =
    | "cli"
    | "summary"
    | "frames"
    | "raw"
    | "playback"
    | "diff"
    | "heatmap";

type CanDataState = {
    commandOpen: boolean;
    activeView: CommandView;

    logs: string[];
    frames: CanFrame[];

    currentSessionId: number | null;

    isPlaying: boolean;
    playbackIndex: number;
    playbackSpeed: number;
    playbackTolerance: number;

    byteVolatility: Record<string, number[]>;

    setCommandOpen: (open: boolean) => void;
    setActiveView: (view: CommandView) => void;
    addLog: (line: string) => void;
    clearLogs: () => void;

    setFrames: (frames: CanFrame[]) => void;
    addFrame: (frame: CanFrame) => void;
    clearFrames: () => void;

    setCurrentSessionId: (id: number | null) => void;

    setPlaying: (playing: boolean) => void;
    setPlaybackIndex: (index: number) => void;
    setPlaybackSpeed: (speed: number) => void;

    computeByteVolatility: () => void;
};

export const useCanDataStore = create<CanDataState>((set, get) => ({
    commandOpen: false,
    activeView: "cli",

    logs: [],
    frames: [],

    currentSessionId: null,

    isPlaying: false,
    playbackIndex: 0,
    playbackSpeed: 5,
    playbackTolerance: 0.001,

    byteVolatility: {},

    setCommandOpen: (open) => set({ commandOpen: open }),
    setActiveView: (view) => set({ activeView: view }),

    addLog: (line) =>
        set((s) => ({
            logs: [...s.logs, line],
        })),

    clearLogs: () => set({ logs: [] }),

    setFrames: (frames) => set({ frames }),
    addFrame: (frame) =>
        set((s) => ({
            frames: [...s.frames, frame],
        })),

    clearFrames: () => set({ frames: [], byteVolatility: {} }),

    setCurrentSessionId: (id) => set({ currentSessionId: id }),

    setPlaying: (playing) => set({ isPlaying: playing }),
    setPlaybackIndex: (index) => set({ playbackIndex: index }),
    setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

    computeByteVolatility: () => {
        const frames = get().frames;
        const volatility: Record<string, number[]> = {};

        for (const frame of frames) {
            const hexId = frame[0];
            const data = frame[6] ?? [];

            if (!volatility[hexId]) {
                volatility[hexId] = Array(data.length).fill(0);
                continue;
            }

            const prev = frames
                .slice()
                .reverse()
                .find((f) => f[0] === hexId && f !== frame);

            if (!prev) continue;

            const prevData = prev[6] ?? [];

            data.forEach((byte, i) => {
                if (prevData[i] !== byte) {
                    volatility[hexId][i] = (volatility[hexId][i] ?? 0) + 1;
                }
            });
        }

        set({ byteVolatility: volatility });
    },
}));