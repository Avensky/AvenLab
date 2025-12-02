// src/store/snapshotStore.ts
import { create } from "zustand";
// import type { PendingInput } from "../types/playerInput";

export type RenderMode = "glb" | "geometry" | "collider";

// export interface PredictedSelfState {
//     x: number;
//     y: number;
//     z: number;
//     yaw: number; // we’ll derive quaternion from yaw
// }
export interface PlayerSnapshot {
    id: string;
    kind: string;
    room_id: number;
    team: "red" | "blue";
    x: number;
    y: number;
    z: number;
}

export interface PhysicsSnapshot {
    tick: number;
    players: PlayerSnapshot[];
}

interface SnapshotState {
    connected: boolean;
    setConnected: (v: boolean) => void;

    snapshot: PhysicsSnapshot | null;
    setSnapshot: (snap: PhysicsSnapshot) => void;

    mode: RenderMode;
    setMode: (mode: RenderMode) => void;

    playerId: string | null;
    setPlayerId: (id: string) => void;

    team: "Red" | "Blue" | null;
    kind: string | null;
    room_id: number | null;
    spawn: [number, number, number] | null;
    x: number | null;
    y: number | null;
    z: number | null;

    tick: number | null;
    // lastTick: number | null;

    getMe: () => PlayerSnapshot | null;
    getOthers: () => PlayerSnapshot[];

    // bodies: BodySnapshot[];
    // predictedSelf: PredictedSelfState | null;
    // pendingInputs: PendingInput[];
    // setBodies: (bodies: BodySnapshot[]) => void;
    // setPredictedSelf: (state: PredictedSelfState | null) => void;
    // addPendingInput: (pi: PendingInput) => void;
    // ackInputsUpTo: (seq: number) => void;
}

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
    connected: false,
    playerId: null,
    snapshot: null,
    tick: 0,
    // lastTick: 0,

    setConnected: (v) => set({ connected: v }),
    setPlayerId: (id) => set({ playerId: id }),
    setSnapshot: snap => set({ snapshot: snap }),


    team: null,
    kind: null,
    room_id: null,
    spawn: null,
    x: null,
    y: null,
    z: null,

    mode: "glb",
    setMode: (mode) => set({ mode }),


    getMe() {
        const snap = get().snapshot;
        const id = get().playerId;
        if (!snap || !id) return null;
        return snap.players.find(p => p.id === id) || null;
    },

    getOthers() {
        const snap = get().snapshot;
        const id = get().playerId;
        if (!snap) return [];
        return snap.players.filter(p => p.id !== id);
    }


    // bodies: [],
    // predictedSelf: null,
    // pendingInputs: [],
    // setBodies: (bodies) => set({ bodies }),
    // setPredictedSelf: (state) => set({ predictedSelf: state }),
    // addPendingInput: (pi) =>
    // set((s) => ({ pendingInputs: [...s.pendingInputs, pi] })),
    // drop all inputs with seq <= ackSeq
    // ackInputsUpTo: (ackSeq) =>
    //     set((s) => ({
    //         pendingInputs: s.pendingInputs.filter((pi) => pi.seq > ackSeq)
    // }))
}));
