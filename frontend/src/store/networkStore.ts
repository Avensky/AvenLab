// networkStore.ts   ← socket + snapshots + player identity
import { create } from "zustand";
import type { Team, VehicleKind } from "./types";

export interface PhysicsSnapshot {
    // type: "physics_snapshot";
    tick: number;               // authoritative sim tick
    // serverTime: number;         // ms, optional but useful
    // entities: Record<string, PhysicsEntity>;
    entities: PhysicsEntitySnapshot[]
}

export type PhysicsData = {
    speed: number
    rpm: number
    gear: number
    fuel: number
    temp: number
    engineTorque: number
    vehicleMask: number,
    playerMask: number,
    wheels?: WheelSnapshot[];
    // steeringValue: number
}

export type WheelId = "fl" | "fr" | "rl" | "rr";

export interface WheelSnapshot {
  id: WheelId;
  position: [number, number, number];
  rotation: [number, number, number, number];
  wheel_speed?: number;  // rad/s is best for tire visual spin
  steer_angle?: number;  // radians, useful for front wheel steering visual
  grounded?: boolean;
}

export interface PhysicsEntitySnapshot {
    id: string;
    kind: VehicleKind;
    team?: Team;
    room_id: number;

    position: [number, number, number];
    rotation: [number, number, number, number];
    wheels?: WheelSnapshot[];

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

export interface PhysicsEntity {
    id: string;                 // entity id (player, AI, drone, etc.)
    kind: VehicleKind; // extensible
    team?: Team;
    physics: PhysicsData;
}

export interface DebugChassis {
    position: [number, number, number];
    rotation: [number, number, number, number]; // x,y,z,w
    half_extents: [number, number, number];     // hx,hy,hz
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
  id: string;
  center: [number, number, number];
  half_extents: [number, number, number];
  kind: "road" | "intersection" | "building" | string;
  visual: string;
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


interface NetworkState {
    // =======================================
    //  Net
    // =======================================
    connected: boolean;
    setConnected: (v: boolean) => void;

    snapshot: PhysicsSnapshot | null;
    setSnapshot: (snap: PhysicsSnapshot) => void;

    physicsData: PhysicsData | null;
    setPhysicsData: (data: PhysicsData | null) => void;

    // =======================================
    //  Player Data
    // =======================================
    playerId: string;
    setPlayerId: (id: string) => void;

    team: Team;
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
    
    debugOverlay: DebugOverlay | null
    setDebugOverlay: (dbg: DebugOverlay) => void
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
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
                    wheels: me.wheels,
                }
                : null,
        });
    },

    physicsData: null,
    setPhysicsData: (data: PhysicsData | null) => set({ physicsData: data }),

    // =======================================
    //  Player Data
    // =======================================
    playerId: "",
    setPlayerId: (id) => set({ playerId: id }),

    team: "blue",
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


    debugOverlay: null,
    setDebugOverlay: (dbg) => set({ debugOverlay: dbg }),
}));
