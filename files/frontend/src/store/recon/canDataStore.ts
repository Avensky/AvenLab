// store/canDataStore.ts
import { create } from "zustand";

// The database retains complete captures; these limits bound the live browser view.
export const CAN_LOG_LIMIT = 1000,
  LIVE_FRAME_LIMIT = 20000;

export type CanFrame = [
  string, // hexId
  string, // signalName
  number, // rawId
  string, // decoded
  number, // timestamp
  number, // elapsedSec
  number[], // data
  number, // dlc
];

type CommandView =
  "cli" | "summary" | "frames" | "raw" | "playback" | "diff" | "heatmap";

type CanDataState = {
  commandOpen: boolean;
  activeView: CommandView;

  logs: string[];
  frames: CanFrame[];
  liveFrameDrops: number;

  currentSessionId: string | null;

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
  addFrames: (frames: CanFrame[]) => void;
  clearFrames: () => void;

  setCurrentSessionId: (id: string | null) => void;

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
  liveFrameDrops: 0,

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
      logs: [...s.logs, line].slice(-CAN_LOG_LIMIT),
    })),

  clearLogs: () => set({ logs: [] }),

  // Explicit playback/import is lossless; only live append uses retention.
  setFrames: (frames) => set({ frames, liveFrameDrops: 0 }),
  addFrame: (frame) => get().addFrames([frame]),
  addFrames: (frames) => {
    if (!frames.length) return;
    set((s) => {
      const dropped = Math.max(
        0,
        s.frames.length + frames.length - LIVE_FRAME_LIMIT,
      );
      return {
        frames: [...s.frames, ...frames].slice(-LIVE_FRAME_LIMIT),
        liveFrameDrops: s.liveFrameDrops + dropped,
      };
    });
  },
  clearFrames: () => set({ frames: [], liveFrameDrops: 0, byteVolatility: {} }),

  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  setPlaying: (playing) => set({ isPlaying: playing }),
  setPlaybackIndex: (index) => set({ playbackIndex: index }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

  computeByteVolatility: () => {
    const frames = get().frames;
    const volatility: Record<string, number[]> = {};

    // Capture order, one pass: reverse/find used future samples and copied
    // the entire recording once per frame (quadratic work on the main thread).
    const previousById = new Map<string, number[]>();
    for (const frame of frames) {
      const hexId = frame[0];
      const data = frame[6] ?? [];

      if (!volatility[hexId]) {
        volatility[hexId] = Array(data.length).fill(0);
      }

      const prevData = previousById.get(hexId);
      if (prevData)
        data.forEach((byte, i) => {
          if (i < prevData.length && prevData[i] !== byte) {
            volatility[hexId][i] = (volatility[hexId][i] ?? 0) + 1;
          }
        });
      previousById.set(hexId, data);
    }

    set({ byteVolatility: volatility });
  },
}));
