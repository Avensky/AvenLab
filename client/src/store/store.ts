// src/store/snapshotStore.ts
import { create } from "zustand";
// import type { Input, PlayerStateInput, VehicleControlInput, VehicleStateInput } from "./playerInput";
import { deriveVehicleSignals } from "../utils/deriveVehicleSignals";
import type { VehicleControls } from "./playerInput";
import type { PhysicsData } from "./snapshot";
import { socket } from "../net/rustSocket";
// import { encodePlayerMask, encodeVehicleMask } from "../utils/encoding";
import { VehicleFlags } from "../utils/inputMasks";
// import type { PendingInput } from "../types/playerInput";
export type RenderMode = "glb" | "geometry" | "collider" | "hybrid";


// export interface PredictedSelfState {
//     x: number;
//     y: number;
//     z: number;
//     yaw: number; // we’ll derive quaternion from yaw
// }

export type Quaternion = [number, number, number, number];
export type Vec3 = [number, number, number];
export type StructureState = "intact" | "damaged" | "destroyed" | "removed";
export type ColliderKind = "box";
export type BlockObjectKind = "road" | "intersection" | "building" | "prop";
export interface BlockObject {
    id: string;
    kind: BlockObjectKind;
    visual: string;
    pos: Vec3;
    rot: Quaternion;
    half_extents: Vec3;
    collider: ColliderKind;
    destructible?: boolean;
    state?: StructureState;
}
export interface BlockColliderFile {
    block_id: string;
    version: number;
    cell: [number, number];
    roads: BlockObject[];
    buildings: BlockObject[];
}
export interface DebugChassis {
    position: [number, number, number];
    rotation: [number, number, number, number]; // x,y,z,w
    half_extents: [number, number, number];     // hx,hy,hz
}
export interface PhysicsEntitySnapshot {
    id: string;
    kind: "vehicle" | "tank" | "drone" | "boat";
    team?: "red" | "blue";
    room_id: number;

    position: [number, number, number];
    rotation: [number, number, number, number];

    // telemetry
    speed: number;
    rpm: number;
    gear: number;
    fuel: number;
    temp: number;
    engine_torque: number;

    vehicle_mask: number;
    player_mask: number;
}

export interface PhysicsSnapshot {
    tick: number;
    entities: PhysicsEntitySnapshot[];
}

export interface PhysicsEntity {
    id: string;                 // entity id (player, AI, drone, etc.)
    kind: "car" | "tank" | "drone" | "boat"; // extensible
    team?: "red" | "blue";

    physics: PhysicsData;
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

export interface DebugAabbBox {
    center: [number,number,number],
    half_extents: [number,number,number],
}
export interface DebugOverlay {
    chassis?: DebugChassis;

    suspension_rays: DebugRay[];
    slip_vectors: DebugSlipRay[];
    load_bars: DebugRay[];
    arb_links: DebugRay[];
    wheels: DebugWheel[];
    chassis_right: [number, number, number];
    block_boxes: DebugAabbBox[];
}

export const cameras = ['GALLERY', 'DEFAULT', 'FIRST_PERSON', 'BIRDS_EYE'] as const
export type Camera = (typeof cameras)[number]

export interface InputPacket {
    type: "input";
    seq: number;
    dt: number;

    // analog controls (always present)
    throttle: number;   // [-1..1]
    steer: number;      // [-1..1]
    brake: number;      // [0..1]
    handbrake: number;  // [0..1]

    // bitmasks
    vehicleMask: number; // uint16
    playerMask: number;  // uint16
}

let seq = 0;

function sendPackedInput(socket: WebSocket | null, input: InputPacket, dt: number) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const packet = {
        type: "input",
        seq: seq++,
        dt,

        throttle: input.throttle,
        steer: input.steer,
        brake: input.brake,
        handbrake: input.handbrake,

        vehicleMask: input.vehicleMask,
        playerMask: input.playerMask,
    };

    socket.send(JSON.stringify(packet));
}

interface SnapshotState {

    // =======================================
    //  Game Selection
    // =======================================
    screen: 'selection-screen' | 'game-screen'
    selectedVehicle: string
    selectedMap: string
    setScreen: (screen: 'selection-screen' | 'game-screen') => void
    setSelectedVehicle: (vehicle: string) => void
    setSelectedMap: (map: string) => void

    camera: Camera
    rotatingCamera: number
    setRotatingCamera: (angle: number) => void

    binding: boolean,
    debugBool: boolean,
    editor: boolean,
    help: boolean,
    menu: boolean,
    cli: boolean,
    map: boolean,
    pickcolor: boolean,
    shadows: boolean,
    sound: boolean,

    // =======================================
    //  Net
    // =======================================
    connected: boolean;
    setConnected: (v: boolean) => void;

    snapshot: PhysicsSnapshot | null;
    setSnapshot: (snap: PhysicsSnapshot) => void;

    physicsData: PhysicsData | null;
    setPhysicsData: (data: PhysicsData | null) => void;

    // getMyPhysics(): PhysicsData | null;
    // getOtherPhysics(): PhysicsData[];

    // =======================================
    // --- INPUT STATE ---
    // =======================================
    seqCounter: number;
    lastVehicleMask: number;
    lastPlayerMask: number;

    input: InputPacket;
    setInput: (partial: Partial<InputPacket>) => void;
    controls: VehicleControls;


    mode: RenderMode;
    setMode: (mode: RenderMode) => void;
    activeBlock: BlockColliderFile | null;
    setActiveBlock: (block: BlockColliderFile | null) => void;
    
    // =======================================
    //  Player Data
    // =======================================
    playerId: string;
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

    getMe: () => PhysicsEntitySnapshot | null;
    getOthers: () => PhysicsEntitySnapshot[];

    // =======================================
    //  Debug
    // =======================================
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
    // =======================================
    //  Game Selection
    // =======================================
    screen: 'selection-screen',
    selectedVehicle: 'ae86',
    selectedMap: 'rtx',
    setScreen: (screen) => { set({ screen }) },
    setSelectedVehicle: (vehicle) => set({ selectedVehicle: vehicle }),
    setSelectedMap: (map) => set({ selectedMap: map }),

    camera: cameras[0],
    rotatingCamera: 0.0,
    setRotatingCamera: (angle: number) => set({ rotatingCamera: angle }),
    binding: false,
    debugBool: false,
    editor: false,
    help: false,
    menu: false,
    cli: false,
    map: true,
    pickcolor: false,
    shadows: true,
    sound: true,

    // =======================================
    //  Net
    // =======================================
    connected: false,
    setConnected: (v) => set({ connected: v }),

    snapshot: null,
    setSnapshot: (snap) => {
        const myId = get().playerId;
        const me = snap.entities.find(e => e.id === myId);

        set({
            snapshot: snap,
            physicsData: me
                ? {
                    speed: me.speed,
                    rpm: me.rpm,
                    gear: me.gear,
                    fuel: me.fuel,
                    temp: me.temp,
                    engineTorque: me.engine_torque,
                    vehicleMask: me.vehicle_mask,
                    playerMask: me.player_mask,
                }
                : null,
        });
    },
    physicsData: null,
    setPhysicsData: (data: PhysicsData | null) => set({ physicsData: data }),

    // getMyPhysics: get({state.physicsData}),
    // getOtherPhysics: PhysicsData[],

    // =======================================
    // --- INPUT ---
    // =======================================
    seqCounter: 0,
    lastVehicleMask: 0,
    lastPlayerMask: 0,

    input: {
        type: "input",
        seq: 0,
        dt: 0,
        throttle: 0,
        steer: 0,
        brake: 0,
        handbrake: 0,
        vehicleMask: VehicleFlags.ENGINE_ON | VehicleFlags.ABS | VehicleFlags.TCS,
        playerMask: 0,
    },

    setInput(partial) {
        const nextInput = { ...get().input, ...partial };

        sendPackedInput(socket, nextInput, 1 / 60);

        set({
            input: nextInput,
            controls: deriveVehicleSignals(nextInput),
        });
    },

    controls: {
        braking: false,
        accelerating: false,
        reversing: false,
        coasting: true,
    },

    mode: "hybrid",
    setMode: (mode) => set({ mode }),
    activeBlock: null,
    setActiveBlock: (block) => set({ activeBlock: block }),

    // =======================================
    //  Player Data
    // =======================================
    playerId: "",
    setPlayerId: (id) => set({ playerId: id }),

    team: null,
    kind: null,
    room_id: null,
    spawn: null,
    x: null,
    y: null,
    z: null,

    tick: 0,


    getMe() {
        const snap = get().snapshot;
        const id = get().playerId;
        if (!snap || !id) return null;

        return snap.entities.find(e => e.id === id) ?? null;
    },

    getOthers() {
        const snap = get().snapshot;
        const id = get().playerId;
        if (!snap) return [];

        return snap.entities.filter(e => e.id !== id);
    },

    // =======================================
    //  Debug
    // =======================================
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
