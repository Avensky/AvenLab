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
    yaw?: number;
    x: number;
    y: number;
    z: number;
}

export interface PhysicsSnapshot {
    tick: number;
    players: PlayerSnapshot[];
}

export interface DebugRay {
    origin: [number, number, number];
    direction: [number, number, number];
    length: number;
    hit?: [number, number, number];
    color: [number, number, number];
}

export interface DebugWheel {
    center: [number, number, number];
    radius: number;
    grounded: boolean;
    compression: number;
    normal_force: number;
}

export interface DebugOverlay {
    rays: DebugRay[];
    wheels: DebugWheel[];
    chassis_right: [number, number, number];
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

    debug: DebugOverlay | null;
    setDebugOverlay: (dbg: DebugOverlay) => void;

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

    mode: "geometry",
    setMode: (mode) => set({ mode }),


    getMe() {
        const snap = get().snapshot;
        const id = get().playerId;
        // console.log("getMe snapshot:", snap, " playerId:", id);
        if (!snap || !id || !snap.players) return null;
        return snap.players.find(p => p.id === id) || null;
        // if (!snap || !id) return null;
        // return snap.players.find(p => p.id === id) || null;
    },

    getOthers() {
        const snap = get().snapshot;
        const id = get().playerId;
        if (!snap || !snap.players) return [];
        return snap.players.filter(p => p.id !== id);
        // if (!snap) return [];
        // return snap.players.filter(p => p.id !== id);
    },

    debug: null,
    setDebugOverlay: (dbg) => set({ debug: dbg }),

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
