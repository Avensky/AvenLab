// src/store/snapshotStore.ts
import { create } from "zustand";
import type { PlayerInput } from "../types/playerInput";
// import type { PendingInput } from "../types/playerInput";

export type RenderMode = "glb" | "geometry" | "collider";

// export interface PredictedSelfState {
//     x: number;
//     y: number;
//     z: number;
//     yaw: number; // we’ll derive quaternion from yaw
// }

export interface DebugChassis {
    position: [number, number, number];
    rotation: [number, number, number, number]; // x,y,z,w
    half_extents: [number, number, number];     // hx,hy,hz
}

export interface PlayerSnapshot {
    id: string;
    kind: string;
    room_id: number;
    team: "red" | "blue";
    x: number;
    y: number;
    z: number;

    // full orientation (world-space)
    rot: [number, number, number, number]; // quaternion [x,y,z,w]

    // OPTIONAL convenience (UI only, never authoritative)
    yaw?: number;
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
export interface DebugSlipRay {
    origin: [number, number, number];
    direction: [number, number, number];
    slip_angle: number;
    magnitude: number;
    color: [number, number, number];
}

export interface DebugWheel {
    center: [number, number, number];
    radius: number;
    grounded: boolean;
    compression: number;
    normal_force: number;
    steering: boolean;
    drive: boolean;
    lateral_force: [number, number, number];
    lateral_magnitude: number;
}

export interface DebugOverlay {
    chassis?: DebugChassis;

    suspension_rays: DebugRay[];
    slip_vectors: DebugSlipRay[];
    load_bars: DebugRay[];
    arb_links: DebugRay[];
    wheels: DebugWheel[];
    chassis_right: [number, number, number];
}

const DEFAULT_INPUT: PlayerInput = {
    type: "input",

    throttle: 0,
    steer: 0,
    brake: 0,

    ascend: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
};

interface SnapshotState {
    connected: boolean;
    setConnected: (v: boolean) => void;

    snapshot: PhysicsSnapshot | null;
    setSnapshot: (snap: PhysicsSnapshot) => void;

    // --- INPUT STATE ---
    input: PlayerInput;
    setInput: (partial: Partial<PlayerInput>) => void;
    resetInput: () => void;

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

    // --- INPUT ---
    input: DEFAULT_INPUT,

    setInput: (partial) =>
        set((s) => ({
            input: { ...s.input, ...partial },
        })),

    resetInput: () => set({ input: DEFAULT_INPUT }),


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
