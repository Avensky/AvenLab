// src/store/snapshotStore.ts
import { create } from "zustand";
import type { BodySnapshot } from "../types/snapshot";
import type { PendingInput } from "../types/playerInput";

export type RenderMode = "glb" | "geometry" | "collider";

export interface PredictedSelfState {
    x: number;
    y: number;
    z: number;
    yaw: number; // we’ll derive quaternion from yaw
}

interface SnapshotState {
    bodies: BodySnapshot[];
    mode: RenderMode;

    selfId: string | null;
    predictedSelf: PredictedSelfState | null;

    pendingInputs: PendingInput[];

    setBodies: (bodies: BodySnapshot[]) => void;
    setMode: (mode: RenderMode) => void;

    setSelfId: (id: string) => void;
    setPredictedSelf: (state: PredictedSelfState | null) => void;

    addPendingInput: (pi: PendingInput) => void;
    ackInputsUpTo: (seq: number) => void;
}

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
    bodies: [],
    mode: "glb",

    selfId: null,
    predictedSelf: null,

    pendingInputs: [],

    setBodies: (bodies) => set({ bodies }),
    setMode: (mode) => set({ mode }),

    setSelfId: (id) => set({ selfId: id }),

    setPredictedSelf: (state) => set({ predictedSelf: state }),

    addPendingInput: (pi) =>
        set((s) => ({ pendingInputs: [...s.pendingInputs, pi] })),

    // drop all inputs with seq <= ackSeq
    ackInputsUpTo: (ackSeq) =>
        set((s) => ({
            pendingInputs: s.pendingInputs.filter((pi) => pi.seq > ackSeq)
        }))
}));
